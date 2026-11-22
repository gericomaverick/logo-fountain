<?php

use App\Exceptions\AuthFailure;
use App\Models\User;
use App\Support\Auth\CredentialFence;
use App\Support\DatabaseRoles;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;

// Story 4.2 AC 1 (A-10, ADR-007): one transaction, the per-user advisory lock, the two local timeouts.

it('runs the work in one runtime transaction with the timeouts set and the lock held', function () {
    $user = User::factory()->create();

    $seen = CredentialFence::run($user->id, function (Connection $db) use ($user) {
        return [
            'connection' => $db->getName(),
            'level' => $db->transactionLevel(),
            'lock' => $db->scalar('SHOW lock_timeout'),
            'statement' => $db->scalar('SHOW statement_timeout'),
            'locked' => (bool) $db->scalar(
                "SELECT count(*) > 0 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted"
            ),
            'key' => $user->id,
        ];
    });

    expect($seen['connection'])->toBe(DatabaseRoles::RUNTIME)
        ->and($seen['level'])->toBeGreaterThanOrEqual(1)
        ->and($seen['lock'])->toBe('5s')
        ->and($seen['statement'])->toBe('20s')
        ->and($seen['locked'])->toBeTrue();
});

it('does not leak the timeouts or the lock past the transaction', function () {
    $user = User::factory()->create();
    CredentialFence::run($user->id, fn () => null);

    $db = DB::connection(DatabaseRoles::RUNTIME);
    expect($db->scalar('SHOW lock_timeout'))->not->toBe('5s')
        ->and((bool) $db->scalar("SELECT count(*) > 0 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()"))->toBeFalse();
});

it('rolls everything back when the work throws', function () {
    $user = User::factory()->create();

    expect(fn () => CredentialFence::run($user->id, function (Connection $db) use ($user) {
        $db->table('users')->where('id', $user->id)->increment('credential_version');
        throw new RuntimeException('boom');
    }))->toThrow(RuntimeException::class, 'boom');

    expect((int) DB::table('users')->where('id', $user->id)->value('credential_version'))->toBe(0);
});

it('turns a statement timeout into the generic AuthFailure', function () {
    $user = User::factory()->create();

    expect(fn () => CredentialFence::run($user->id, function (Connection $db) {
        $db->statement("SET LOCAL statement_timeout = '50ms'");
        $db->select('SELECT pg_sleep(1)');
    }))->toThrow(AuthFailure::class);
});
