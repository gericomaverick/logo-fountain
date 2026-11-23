<?php

use App\Models\Profile;
use App\Models\User;
use App\Support\DatabaseRoles;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 4.9a AC 1-5, 7 (A-12; Next scripts/bootstrap-admin.mjs). Committed rows: the command runs on pgsql_migrate.
pest()->use(TruncatesDatabaseAsOwner::class);

const BOOTSTRAP_ACK = 'ONE_TIME_ADMIN_BOOTSTRAP';

function ownerDb(): Connection
{
    return DB::connection(DatabaseRoles::MIGRATE);
}

function grantArgs(string $email, string $id, ?string $ack = BOOTSTRAP_ACK): array
{
    return ['--email' => $email, '--confirm-user' => $id] + ($ack === null ? [] : ['--ack' => $ack]);
}

it('prepares an unprivileged, unverified identity and prints its UUID', function () {
    $this->artisan('portal:bootstrap-admin', ['--prepare' => true, '--email' => ' Op@Example.com '])
        ->expectsOutputToContain('Unprivileged identity: ')->assertExitCode(0);

    $user = ownerDb()->table('users')->where('email', 'op@example.com')->first();
    expect($user->email_verified_at)->toBeNull()
        ->and(ownerDb()->table('profiles')->where('id', $user->id)->value('is_admin'))->toBeFalse()
        ->and(ownerDb()->table('auth_admin_bootstrap')->count())->toBe(0);
});

it('refuses a grant without the ack, or with a non-UUID', function () {
    $user = User::factory()->create();
    $this->artisan('portal:bootstrap-admin', grantArgs($user->email, $user->id, null))->assertExitCode(1);
    $this->artisan('portal:bootstrap-admin', grantArgs($user->email, $user->id, 'yes'))->assertExitCode(1);
    $this->artisan('portal:bootstrap-admin', grantArgs($user->email, 'nope'))->assertExitCode(1);
});

it('grants admin once, writes the marker and the audit row together', function () {
    $user = Profile::factory()->create()->user;
    $this->artisan('portal:bootstrap-admin', grantArgs($user->email, $user->id))->expectsOutputToContain('committed')->assertExitCode(0);

    expect((bool) ownerDb()->table('profiles')->where('id', $user->id)->value('is_admin'))->toBeTrue()
        ->and(ownerDb()->table('auth_admin_bootstrap')->pluck('user_id', 'id')->all())->toBe([1 => $user->id]);
    $audit = ownerDb()->table('audit_events')->where('type', 'admin.bootstrapped')->first();
    expect($audit->actor_id)->toBe($user->id)->and(json_decode($audit->payload, true))->toBe(['userId' => $user->id]);

    $this->artisan('portal:bootstrap-admin', grantArgs($user->email, $user->id))->expectsOutputToContain('already consumed')->assertExitCode(1);
});

it('refuses each bad state with its own message and writes nothing', function (string $case, string $message) {
    $user = Profile::factory()->create()->user;
    $id = $user->id;
    $email = $user->email;
    if ($case === 'unverified') {
        ownerDb()->table('users')->where('id', $id)->update(['email_verified_at' => null]);
    } elseif ($case === 'wrong-uuid') {
        $id = (string) Str::uuid();
    } elseif ($case === 'wrong-email') {
        $email = 'other@example.com';
    } elseif ($case === 'admin-exists') {
        $other = Profile::factory()->admin()->create();
    } elseif ($case === 'no-profile') {
        ownerDb()->table('profiles')->where('id', $id)->delete();
    }

    $this->artisan('portal:bootstrap-admin', grantArgs($email, $id))->expectsOutputToContain($message)->assertExitCode(1);

    expect(ownerDb()->table('auth_admin_bootstrap')->count())->toBe(0)
        ->and(ownerDb()->table('audit_events')->count())->toBe(0)
        ->and(ownerDb()->table('profiles')->where('is_admin', true)->count())->toBe($case === 'admin-exists' ? 1 : 0);
})->with([
    ['unverified', 'verified mailbox'], ['wrong-uuid', 'exact email and UUID'], ['wrong-email', 'exact email and UUID'],
    ['admin-exists', 'admin already exists'], ['no-profile', 'profile row is missing'],
]);

it('refuses to run on the runtime connection', function () {
    $this->artisan('portal:bootstrap-admin', ['--prepare' => true, '--email' => 'a@example.com', '--database' => 'pgsql'])
        ->expectsOutputToContain('migrate')->assertExitCode(1);
    expect(ownerDb()->table('users')->count())->toBe(0);
});
