<?php

use App\Exceptions\AuthFailure;
use App\Models\Profile;
use App\Models\User;
use App\Support\Auth\AuthProofs;
use App\Support\Auth\CredentialFence;
use App\Support\DatabaseRoles;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\Support\RaceChildren;
use Tests\Support\SessionRows;

// Story 4.2 AC 2, 6, 7 (A-10, ledger #66 cases 4-6; Next lib/auth.postgres.integration.test.ts:89,101,113,122).

afterEach(function () {
    DB::purge('pgsql_fence_other');
    DB::disconnect(DatabaseRoles::RUNTIME);
    DB::disconnect(DatabaseRoles::MIGRATE);
});

function wins(array $results): int
{
    return count(array_filter($results, fn (array $r) => $r['won']));
}

function versionOf(User $user): int
{
    return (int) DB::table('users')->where('id', $user->id)->value('credential_version');
}

it('gives two concurrent resets one winner and leaves no session or proof', function () {
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'reset');
    SessionRows::insert('sess-a', $user->id, time());

    $results = RaceChildren::run('reset', 2, [$user->id, $token]);

    expect(wins($results))->toBe(1)
        ->and(versionOf($user))->toBe(1)
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0)
        ->and(DB::table('auth_proofs')->where('user_id', $user->id)->count())->toBe(0);
})->group('pg-race');

it('kills every outstanding proof of every kind once any credential transition commits', function () {
    $user = User::factory()->create();
    $tokens = array_map(fn (string $kind) => AuthProofs::issue($user, $kind), ['setup', 'reset', 'magic']);

    RaceChildren::run('change', 1, [$user->id, '0']);

    foreach ($tokens as $token) {
        expect(fn () => CredentialFence::run($user->id, fn (Connection $db) => AuthProofs::validate($db, $token, AuthProofs::KINDS)))
            ->toThrow(AuthFailure::class);
    }
})->group('pg-race');

it('lets a login that read the old password only keep a session if it ran before the reset', function () {
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'reset');

    [$a] = RaceChildren::runMixed([['reset', [$user->id, $token]], ['login', [$user->id, '0', 'login-sess']]]);

    expect($a['won'])->toBeTrue()
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0)
        ->and(versionOf($user))->toBe(1);
})->group('pg-race');

it('has one winner between a reset and a change', function () {
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'reset');
    SessionRows::insert('sess-a', $user->id, time());

    $results = RaceChildren::runMixed([['reset', [$user->id, $token]], ['change', [$user->id, '0']]]);

    expect(wins($results))->toBe(1)
        ->and(versionOf($user))->toBe(1)
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0);
})->group('pg-race');

// The real ResetPassword / ChangePassword actions (the tests above use 4.2's fence-only stand-ins).
it('gives two real concurrent ResetPassword calls on one token a single winner', function () {
    $user = User::factory()->create();
    Profile::factory()->create(['id' => $user->id]); // the audit actor
    $token = AuthProofs::issue($user, 'reset');
    SessionRows::insert('sess-a', $user->id, time());

    $results = RaceChildren::run('reset-real', 2, [$token, 'a brand new password']);

    expect(wins($results))->toBe(1)
        ->and(versionOf($user))->toBe(1)
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0)
        ->and(DB::table('auth_proofs')->where('user_id', $user->id)->count())->toBe(0)
        ->and(DB::table('audit_events')->where('type', 'auth.password_reset')->count())->toBe(1);
})->group('pg-race');

it('gives a real ResetPassword and a real ChangePassword one winner', function () {
    $user = User::factory()->create(['password' => Hash::make('old password 123')]);
    Profile::factory()->create(['id' => $user->id]);
    $token = AuthProofs::issue($user, 'reset');
    SessionRows::insert('sess-a', $user->id, time());

    $results = RaceChildren::runMixed([
        ['reset-real', [$token, 'reset chosen password']],
        ['change-real', [$user->id, 'sess-a', time(), 'old password 123', 'change chosen password']],
    ]);

    $hash = (string) DB::table('users')->where('id', $user->id)->value('password');
    expect(wins($results))->toBe(1)
        ->and(versionOf($user))->toBe(1)
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0)
        ->and(DB::table('auth_proofs')->where('user_id', $user->id)->count())->toBe(0)
        ->and(Hash::check($results[0]['won'] ? 'reset chosen password' : 'change chosen password', $hash))->toBeTrue();
})->group('pg-race');

it('answers the generic AuthFailure when the lock is held past the lock timeout', function () {
    config(['database.connections.pgsql_fence_other' => config('database.connections.'.DatabaseRoles::RUNTIME)]);
    $user = User::factory()->create();
    $other = DB::connection('pgsql_fence_other');
    $other->beginTransaction();
    $other->select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', ['auth:'.$user->id]);

    $started = microtime(true);
    try {
        CredentialFence::run($user->id, fn () => 'never');
        $thrown = null;
    } catch (Throwable $e) {
        $thrown = $e;
    }
    $other->rollBack();

    expect($thrown)->toBeInstanceOf(AuthFailure::class)
        ->and($thrown->status)->toBe(400)
        ->and($thrown->errorCode)->toBe('AUTH_FAILED')
        ->and(microtime(true) - $started)->toBeGreaterThan(4.5)->toBeLessThan(8.0);
})->group('pg-race');

it('rolls back the password, the proof, the sessions and the version together when the work fails late', function () {
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'reset');
    SessionRows::insert('sess-a', $user->id, time());

    expect(fn () => CredentialFence::run($user->id, function (Connection $db) use ($user, $token) {
        $proof = AuthProofs::validate($db, $token, ['reset']);
        $db->table('users')->where('id', $user->id)->update(['password' => 'changed']);
        $db->table('users')->where('id', $user->id)->increment('credential_version');
        AuthProofs::consume($db, $proof);
        $db->table('sessions')->where('user_id', $user->id)->delete();

        throw new RuntimeException('injected after the password write');
    }))->toThrow(RuntimeException::class, 'injected');

    expect(versionOf($user))->toBe(0)
        ->and(DB::table('users')->where('id', $user->id)->value('password'))->not->toBe('changed')
        ->and(DB::table('auth_proofs')->where('user_id', $user->id)->count())->toBe(1)
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(1);
})->group('pg-race');
