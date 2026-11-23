<?php

// Story 2.4: one child process of an L3 race test (started in parallel by Tests\Support\RaceChildren).
// argv: <mode> <startAt unix time, float> <mode args...>. Prints one JSON line; exits non-zero on any other error.

use App\Actions\Auth\ConfirmMagicLink;
use App\Exceptions\ApiException;
use App\Exceptions\AuthFailure;
use App\Support\Audit;
use App\Support\Auth\AuthProofs;
use App\Support\Auth\CredentialFence;
use App\Support\DatabaseRoles;
use App\Support\Db;
use App\Support\Locks;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB as Database;

require __DIR__.'/../../../vendor/autoload.php';
$app = require __DIR__.'/../../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[, $mode, $startAt] = $argv;
$args = array_slice($argv, 3);
$db = Database::connection(DatabaseRoles::RUNTIME);
$db->select('SELECT 1'); // connect before the barrier

// All children start their work at the same moment.
while (microtime(true) < (float) $startAt) {
    usleep(1000);
}

$out = match ($mode) {
    // Serializable read-then-write increments of projects.version through the guard.
    'increment' => (function () use ($args): array {
        [$projectId, $iterations] = $args;
        $out = ['ok' => 0, 'attempts' => 0, 'conflicts' => []];
        for ($i = 0; $i < (int) $iterations; $i++) {
            try {
                Db::serializable(function (Connection $db) use ($projectId, &$out): void {
                    $out['attempts']++;
                    $row = $db->table('projects')->where('id', $projectId)->first(['status', 'version']);
                    usleep(2000); // widen the read-write window
                    Db::guardedProjectUpdate($projectId, $row->status, (int) $row->version, [], new ApiException('Version conflict', 409, 'STATUS_CHANGE_CONFLICT'));
                }, new ApiException('Lifecycle conflict', 409, 'LIFECYCLE_CONFLICT'));
                $out['ok']++;
            } catch (ApiException $e) {
                $out['conflicts'][$e->errorCode] = ($out['conflicts'][$e->errorCode] ?? 0) + 1;
            }
        }

        return $out;
    })(),

    // One guarded update against a version every child read before the barrier (no serializable).
    'guard' => (function () use ($args): array {
        [$projectId, $version] = $args;
        try {
            return ['newVersion' => Db::guardedProjectUpdate($projectId, 'active', (int) $version, ['status' => 'on_hold'], new ApiException('Version conflict', 409, 'STATUS_CHANGE_CONFLICT'))];
        } catch (ApiException $e) {
            return ['conflict' => $e->errorCode];
        }
    })(),

    // Ledger #96 test 4: advisory-locked receipts converge (Next postgres.integration.test.ts:52).
    'receipt' => (function () use ($args, $db): array {
        [$projectId, $requestKey, $actorId, $publication] = $args;

        return $db->transaction(function (Connection $db) use ($projectId, $requestKey, $actorId, $publication): array {
            Locks::conceptUpload($projectId, $requestKey);
            $found = $db->table('audit_events')->where('project_id', $projectId)->where('type', 'concept_upload_request')
                ->whereRaw("payload->>'requestKey' = ?", [$requestKey])->value('payload');
            if (is_string($found)) {
                return ['replayed' => true, 'result' => json_decode($found, true)['result']];
            }
            usleep(20000); // widen the check-then-insert window
            $result = json_decode($publication, true);
            Audit::record('concept_upload_request', $projectId, $actorId, ['requestKey' => $requestKey, 'digest' => str_repeat('a', 64), 'result' => $result]);

            return ['replayed' => false, 'result' => $result];
        });
    })(),

    // Story 4.2: stand-ins for the 4.5/4.6 credential actions, shaped as ADR-007 prescribes (all under the fence).
    // reset: validate the proof, bump the version, drop the user's proofs and sessions.
    'reset' => (function () use ($args): array {
        [$userId, $token] = $args;
        try {
            CredentialFence::run($userId, function (Connection $db) use ($userId, $token): void {
                $proof = AuthProofs::validate($db, $token, ['reset']);
                $db->table('users')->where('id', $userId)->increment('credential_version');
                $db->table('auth_proofs')->where('user_id', $userId)->delete();
                $db->table('sessions')->where('user_id', $userId)->delete();
                AuthProofs::consume($db, $proof);
            });

            return ['won' => true];
        } catch (AuthFailure) {
            return ['won' => false];
        }
    })(),

    // change: the password was checked against $expectedVersion before the barrier; stale means someone else won.
    'change' => (function () use ($args): array {
        [$userId, $expectedVersion] = $args;
        try {
            CredentialFence::run($userId, function (Connection $db) use ($userId, $expectedVersion): void {
                if ((int) $db->table('users')->where('id', $userId)->value('credential_version') !== (int) $expectedVersion) {
                    throw new AuthFailure;
                }
                $db->table('users')->where('id', $userId)->increment('credential_version');
                $db->table('auth_proofs')->where('user_id', $userId)->delete();
                $db->table('sessions')->where('user_id', $userId)->delete();
            });

            return ['won' => true];
        } catch (AuthFailure) {
            return ['won' => false];
        }
    })(),

    // login: the password matched $expectedVersion before the barrier; it only gets a session if still current.
    'login' => (function () use ($args): array {
        [$userId, $expectedVersion, $sessionId] = $args;
        try {
            CredentialFence::run($userId, function (Connection $db) use ($userId, $expectedVersion, $sessionId): void {
                if ((int) $db->table('users')->where('id', $userId)->value('credential_version') !== (int) $expectedVersion) {
                    throw new AuthFailure;
                }
                $db->table('sessions')->insert(['id' => $sessionId, 'user_id' => $userId, 'payload' => '', 'last_activity' => time()]);
            });

            return ['won' => true];
        } catch (AuthFailure) {
            return ['won' => false];
        }
    })(),

    // bootstrap (story 4.9a, A-12): the real portal:bootstrap-admin grant on pgsql_migrate; a QueryException escapes and fails the child.
    'bootstrap' => (function () use ($args, $app): array {
        [$email, $userId] = $args;
        $kernel = $app->make(Kernel::class);
        $code = $kernel->call('portal:bootstrap-admin', ['--email' => $email, '--confirm-user' => $userId, '--ack' => 'ONE_TIME_ADMIN_BOOTSTRAP']);

        return ['won' => $code === 0, 'output' => trim($kernel->output())];
    })(),

    // confirm (story 4.5): the real ConfirmMagicLink action, one token, many children.
    'confirm' => (function () use ($args): array {
        [$token] = $args;
        try {
            (new ConfirmMagicLink)->handle($token, app('session.store'));

            return ['won' => true];
        } catch (AuthFailure) {
            return ['won' => false];
        }
    })(),
};

echo json_encode($out), "\n";
