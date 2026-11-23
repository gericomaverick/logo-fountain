<?php

use App\Models\User;
use App\Support\Auth\AuthProofs;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Support\RateLimitBuckets;

// Story 4.5 AC 1-3, 5-9 (A-05 confirm half, A-18; ledger verify/route.test.ts).

beforeEach(function () {
    config(['session.driver' => 'database', 'portal.public_site_url' => 'https://app.example.com', 'portal.auth_client_ip_header' => 'cf-connecting-ip']);
});

function verify(mixed $token, string $address = '203.0.113.7'): TestResponse
{
    return test()->withHeaders(['Origin' => 'https://app.example.com', 'Cf-Connecting-Ip' => $address])
        ->postJson('/api/auth/magic-link/verify', ['token' => $token]);
}

function setCookies(TestResponse $r): array
{
    return array_map(fn ($c) => $c->getName(), $r->baseResponse->headers->getCookies());
}

const FAILED = ['error' => ['code' => 'AUTH_FAILED', 'message' => 'Authentication could not be completed. Check your details or request a new link.']];

it('signs in, sets the cookie, deletes the proof and verifies the mailbox without a password', function () {
    $user = User::factory()->create(['email_verified_at' => null, 'password' => null]);
    $token = AuthProofs::issue($user, 'magic');

    $r = verify($token);

    $r->assertOk()->assertExactJson(['ok' => true]);
    expect(setCookies($r))->toBe([config('session.cookie')])
        ->and($r->headers->get('Cache-Control'))->toBe('no-store')
        ->and(DB::table('auth_proofs')->count())->toBe(0)
        ->and(DB::table('sessions')->where('user_id', $user->id)->exists())->toBeTrue()
        ->and(DB::table('users')->where('id', $user->id)->value('email_verified_at'))->not->toBeNull()
        ->and(DB::table('users')->where('id', $user->id)->value('password'))->toBeNull();
});

it('keeps an existing verified time and fails the second confirm', function () {
    $user = User::factory()->create(['email_verified_at' => '2026-01-01 00:00:00']);
    $token = AuthProofs::issue($user, 'magic');

    verify($token)->assertOk();
    verify($token)->assertStatus(400)->assertExactJson(FAILED);

    expect((string) DB::table('users')->where('id', $user->id)->value('email_verified_at'))->toStartWith('2026-01-01');
});

it('fails a malformed token before any lookup', function () {
    foreach (['short', str_repeat('a', 257), str_repeat('a', 19).'!', '', 12345, null] as $i => $bad) {
        $r = verify($bad, "203.0.113.{$i}");
        $r->assertStatus(400)->assertExactJson(FAILED);
        expect(setCookies($r))->toBe([]);
    }
});

it('fails an unknown, expired, wrong-kind or outdated proof and leaves the proof row', function (string $case) {
    $user = User::factory()->create();
    $kind = $case === 'kind' ? 'reset' : 'magic';
    $token = AuthProofs::issue($user, $kind);
    if ($case === 'expired') {
        Carbon::setTestNow(now()->addSeconds(AuthProofs::LIFETIME_SECONDS + 1));
    }
    if ($case === 'version') {
        DB::table('users')->where('id', $user->id)->increment('credential_version');
    }
    if ($case === 'unknown') {
        $token = str_repeat('z', 43);
    }

    $r = verify($token);

    $r->assertStatus(400)->assertExactJson(FAILED);
    expect(setCookies($r))->toBe([])
        ->and(DB::table('sessions')->whereNotNull('user_id')->count())->toBe(0)
        ->and(DB::table('auth_proofs')->count())->toBe(1);
    Carbon::setTestNow();
})->with(['unknown', 'expired', 'kind', 'version']);

it('limits a token to five tries a path before reading the proof', function () {
    $bad = str_repeat('q', 30);
    foreach (range(1, 5) as $_) {
        verify($bad)->assertStatus(400);
    }
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'magic');

    $limited = verify($bad);

    $limited->assertStatus(429)->assertExactJson(['error' => ['code' => 'RATE_LIMITED']]);
    expect(setCookies($limited))->toBe([])
        ->and(RateLimitBuckets::hits('/api/auth/magic-link/verify:address:203.0.113.7'))->toBe(6);
    // A different token from the same address is its own identity bucket and still works.
    verify($token)->assertOk();
});

it('regenerates the session id on success', function () {
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'magic');
    $this->withSession(['anon' => 1]);
    $before = session()->getId();

    verify($token)->assertOk();

    expect(DB::table('sessions')->where('id', $before)->exists())->toBeFalse()
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(1);
});

it('consumes nothing on GET /auth/callback', function () {
    $user = User::factory()->create();
    AuthProofs::issue($user, 'magic');

    $this->get('/auth/callback');

    expect(DB::table('auth_proofs')->count())->toBe(1);
});
