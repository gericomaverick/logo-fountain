<?php

use App\Actions\Auth\ResetPassword;
use App\Models\Profile;
use App\Models\User;
use App\Support\Auth\AuthProofs;
use App\Support\DatabaseRoles;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\Support\SessionRows;

// Story 4.6 AC 5 (A-07, ledger #66 case 7; Next integration.test.ts:122): a database failure AFTER the password
// write rolls back the password, the proof deletion, the version bump and the session deletion.

afterEach(function () {
    DB::connection(DatabaseRoles::MIGRATE)->unprepared('DROP TRIGGER IF EXISTS fail_auth_audit ON audit_events; DROP FUNCTION IF EXISTS fail_auth_audit()');
    DB::disconnect(DatabaseRoles::RUNTIME);
    DB::disconnect(DatabaseRoles::MIGRATE);
});

it('rolls everything back when the audit write fails, then succeeds once the fault is gone', function () {
    $user = User::factory()->create(['password' => Hash::make('old password 1')]);
    Profile::factory()->create(['id' => $user->id]); // the audit actor
    SessionRows::insert('old-session', $user->id, time());
    $token = AuthProofs::issue($user, 'reset');
    $owner = DB::connection(DatabaseRoles::MIGRATE);
    // Only the owner role can install this fault fixture.
    $owner->unprepared("CREATE FUNCTION fail_auth_audit() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN IF NEW.actor_id = '{$user->id}' AND NEW.type = 'auth.password_reset' THEN RAISE EXCEPTION 'isolated fault'; END IF; RETURN NEW; END \$\$; CREATE TRIGGER fail_auth_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_auth_audit()");

    expect(fn () => (new ResetPassword)->handle($token, 'a brand new password'))->toThrow(QueryException::class);

    $row = $owner->table('users')->where('id', $user->id)->first();
    expect(Hash::check('old password 1', $row->password))->toBeTrue()
        ->and((int) $row->credential_version)->toBe(0)
        ->and($owner->table('auth_proofs')->where('user_id', $user->id)->count())->toBe(1)
        ->and($owner->table('sessions')->where('id', 'old-session')->exists())->toBeTrue()
        ->and($owner->table('audit_events')->where('type', 'auth.password_reset')->count())->toBe(0);

    $owner->unprepared('DROP TRIGGER fail_auth_audit ON audit_events; DROP FUNCTION fail_auth_audit()');
    (new ResetPassword)->handle($token, 'a brand new password');

    expect($owner->table('sessions')->where('id', 'old-session')->exists())->toBeFalse()
        ->and(Hash::check('a brand new password', (string) $owner->table('users')->where('id', $user->id)->value('password')))->toBeTrue();
})->group('pg-race');
