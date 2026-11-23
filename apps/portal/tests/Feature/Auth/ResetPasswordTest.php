<?php

use App\Models\Profile;
use App\Models\User;
use App\Support\Auth\AuthProofs;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\Support\SessionRows;

// Story 4.6 AC 1-4, 6-9 (A-07, A-08; ledger reset-password/route.test.ts, validation.test.ts password cases).

const RESET_NEWPW = 'a brand new password';
const RESET_WEAK = ['error' => ['code' => 'WEAK_PASSWORD', 'message' => 'Authentication could not be completed. Check your details or request a new link.']];
const RESET_GENERIC = ['error' => ['code' => 'AUTH_FAILED', 'message' => 'Authentication could not be completed. Check your details or request a new link.']];

beforeEach(function () {
    config(['session.driver' => 'database', 'portal.public_site_url' => 'https://app.example.com', 'portal.auth_client_ip_header' => 'cf-connecting-ip']);
});

/** A provisioned account: the audit row's actor is the portal profile with the same id. */
function accountWith(array $attributes = []): User
{
    $user = User::factory()->create($attributes);
    Profile::factory()->create(['id' => $user->id]);

    return $user;
}

function postReset(mixed $token, mixed $password = RESET_NEWPW, string $address = '203.0.113.7'): TestResponse
{
    return test()->withHeaders(['Origin' => 'https://app.example.com', 'Cf-Connecting-Ip' => $address])
        ->postJson('/api/auth/reset-password', ['token' => $token, 'newPassword' => $password]);
}

function cookieNames(TestResponse $r): array
{
    return array_map(fn ($c) => $c->getName(), $r->baseResponse->headers->getCookies());
}

it('resets with a reset proof: password, verified, version, proofs, sessions, audit, no cookie', function (string $kind) {
    $user = accountWith(['email_verified_at' => null, 'password' => $kind === 'setup' ? null : Hash::make('old password 1')]);
    SessionRows::insert('s1', $user->id, time());
    SessionRows::insert('s2', $user->id, time());
    $token = AuthProofs::issue($user, $kind);
    AuthProofs::issue($user, 'magic');

    $r = postReset($token);

    $r->assertOk()->assertExactJson(['ok' => true]);
    $row = DB::table('users')->where('id', $user->id)->first();
    expect(cookieNames($r))->toBe([])
        ->and($r->headers->get('Cache-Control'))->toBe('no-store')
        ->and(Hash::check(RESET_NEWPW, $row->password))->toBeTrue()
        ->and($row->email_verified_at)->not->toBeNull()
        ->and((int) $row->credential_version)->toBe(1)
        ->and(DB::table('auth_proofs')->where('user_id', $user->id)->count())->toBe(0)
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0);
    $audit = DB::table('audit_events')->where('type', 'auth.password_reset')->get();
    expect($audit)->toHaveCount(1)
        ->and($audit[0]->actor_id)->toBe($user->id)
        ->and(json_decode($audit[0]->payload, true))->toBe(['method' => $kind]);
})->with(['reset', 'setup']);

it('fails the same token a second time', function () {
    $user = accountWith();
    $token = AuthProofs::issue($user, 'reset');

    postReset($token)->assertOk();
    postReset($token, 'another password 9')->assertStatus(400)->assertExactJson(RESET_GENERIC);

    expect(Hash::check(RESET_NEWPW, (string) DB::table('users')->where('id', $user->id)->value('password')))->toBeTrue();
});

it('refuses a weak password before reading the proof, with the proof untouched', function (string $password) {
    $user = accountWith();
    $token = AuthProofs::issue($user, 'reset');

    postReset($token, $password)->assertStatus(400)->assertExactJson(RESET_WEAK);
    // Weak and unknown token: still RESET_WEAK, never a lookup.
    postReset(str_repeat('z', 43), $password, '203.0.113.9')->assertStatus(400)->assertExactJson(RESET_WEAK);

    expect(DB::table('auth_proofs')->count())->toBe(1);
})->with(['short' => 'abc1234', 'too long' => str_repeat('a', 73), 'empty' => '']);

it('fails a missing or non-string password as weak', function () {
    $user = accountWith();
    $token = AuthProofs::issue($user, 'reset');

    postReset($token, null)->assertStatus(400)->assertExactJson(RESET_WEAK);
    postReset($token, 12345678)->assertStatus(400)->assertExactJson(RESET_WEAK);
});

it('fails a magic, expired, outdated, malformed or unknown token generically and changes nothing', function (string $case) {
    $user = accountWith(['password' => Hash::make('old password 1')]);
    $token = AuthProofs::issue($user, $case === 'magic' ? 'magic' : 'reset');
    if ($case === 'expired') {
        Carbon::setTestNow(now()->addSeconds(AuthProofs::LIFETIME_SECONDS + 1));
    }
    if ($case === 'version') {
        DB::table('users')->where('id', $user->id)->increment('credential_version');
    }
    $token = match ($case) {
        'malformed' => 'short',
        'unknown' => str_repeat('z', 43),
        default => $token,
    };

    $r = postReset($token);

    $r->assertStatus(400)->assertExactJson(RESET_GENERIC);
    expect(cookieNames($r))->toBe([])
        ->and(Hash::check('old password 1', (string) DB::table('users')->where('id', $user->id)->value('password')))->toBeTrue()
        ->and(DB::table('auth_proofs')->count())->toBe(1);
    Carbon::setTestNow();
})->with(['magic', 'expired', 'version', 'malformed', 'unknown']);

it('lets a stale setup proof fail once a transition has happened (AC 6)', function () {
    $user = accountWith(['password' => null]);
    $setup = AuthProofs::issue($user, 'setup');
    $reset = AuthProofs::issue($user, 'reset');

    postReset($reset)->assertOk();
    // The reset removed every proof; and even a restored one would carry the old version.
    postReset($setup, 'yet another pw 3', '203.0.113.9')->assertStatus(400)->assertExactJson(RESET_GENERIC);
});

it('limits by token and path', function () {
    $bad = str_repeat('q', 30);
    foreach (range(1, 5) as $_) {
        postReset($bad)->assertStatus(400);
    }

    postReset($bad)->assertStatus(429)->assertExactJson(['error' => ['code' => 'RATE_LIMITED']]);
});

it('keeps tokens and passwords out of the audit row and the logs', function () {
    $user = accountWith();
    $token = AuthProofs::issue($user, 'reset');

    postReset($token)->assertOk();

    $payload = (string) DB::table('audit_events')->where('type', 'auth.password_reset')->value('payload');
    expect($payload)->not->toContain($token)->and($payload)->not->toContain(RESET_NEWPW);
});
