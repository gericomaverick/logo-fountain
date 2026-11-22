<?php

use App\Support\ErrorCodes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\Support\LoginRequests as L;
use Tests\Support\RateLimitBuckets;

// Story 4.3 AC 1-3, 6-8 (A-01, ledger #24; contract auth-session.spec.ts:26-80).

const INVALID = ['error' => ['code' => 'INVALID_CREDENTIALS', 'message' => 'Email or password is incorrect, or mailbox verification is required.']];

beforeEach(fn () => config(['session.driver' => 'database']));

function cookies(TestResponse $r): array
{
    return array_map(fn ($c) => $c->getName(), $r->baseResponse->headers->getCookies());
}

it('signs in a verified account and issues the session', function () {
    $user = L::user(['email' => 'ada@example.test']);

    $r = L::post(['email' => '  Ada@Example.TEST ', 'password' => L::PASSWORD]);

    $r->assertOk()->assertExactJson(['ok' => true]);
    expect(cookies($r))->toBe([config('session.cookie')])
        ->and($r->headers->get('Cache-Control'))->toBe('no-store');
    $row = DB::table('sessions')->where('user_id', $user->id)->first();
    expect($row)->not->toBeNull();
    $data = json_decode((string) base64_decode((string) $row->payload), true);
    expect($data)->toHaveKeys(['auth.user_id', 'auth.issued_at']);
});

it('answers every failure arm with the same bytes and no cookie', function () {
    L::user(['email' => 'ok@example.test']);
    L::user(['email' => 'nopass@example.test', 'password' => null]);
    L::user(['email' => 'unverified@example.test', 'email_verified_at' => null]);
    $limited = L::user(['email' => 'limited@example.test']);
    foreach (range(1, 5) as $_) {
        L::post(['email' => $limited->email, 'password' => 'wrong-password']);
    }

    $arms = [
        'wrong password' => ['email' => 'ok@example.test', 'password' => 'nope-nope'],
        'unknown account' => ['email' => 'ghost@example.test', 'password' => L::PASSWORD],
        'no password' => ['email' => 'nopass@example.test', 'password' => L::PASSWORD],
        'unverified' => ['email' => 'unverified@example.test', 'password' => L::PASSWORD],
        'rate limited' => ['email' => 'limited@example.test', 'password' => L::PASSWORD],
    ];
    $bodies = [];
    foreach ($arms as $name => $body) {
        $r = L::post($body);
        $r->assertStatus(400)->assertExactJson(INVALID);
        expect(cookies($r))->toBe([], $name);
        $bodies[$name] = $r->getContent();
    }
    expect(array_unique($bodies))->toHaveCount(1);
});

it('refuses bad input before any limiter work', function (array $body) {
    L::post($body)->assertStatus(400)->assertExactJson(INVALID);
    expect(RateLimitBuckets::count())->toBe(0);
})->with([
    'empty email' => [['email' => '', 'password' => 'x']],
    'blank email' => [['email' => '   ', 'password' => 'x']],
    'empty password' => [['email' => 'a@example.test', 'password' => '']],
    'missing fields' => [['other' => 1]],
    'non-string password' => [['email' => 'a@example.test', 'password' => 12345]],
    '73 bytes' => [['email' => 'a@example.test', 'password' => str_repeat('a', 73)]],
    '37 two-byte characters (74 bytes)' => [['email' => 'a@example.test', 'password' => str_repeat('é', 37)]],
]);

it('accepts a password of exactly 72 bytes', function () {
    $password = str_repeat('a', 72);
    $user = L::user(['password' => Hash::make($password)]);

    L::post(['email' => $user->email, 'password' => $password])->assertOk();
});

it('is fail-closed in production without a trusted address, before the failure bucket', function () {
    app()->instance('env', 'production');

    $r = L::post(['email' => 'a@example.test', 'password' => 'x']);

    $r->assertStatus(503)->assertJsonPath('error.code', ErrorCodes::AUTH_UNAVAILABLE);
    expect(RateLimitBuckets::count())->toBe(0);
});

it('runs the proxy check, the origin guard and the JSON boundary before the body', function () {
    config(['portal.public_site_url' => 'https://app.example.com']);
    L::post(['email' => 'a@example.test', 'password' => 'x'], origin: 'https://evil.example')
        ->assertStatus(403)->assertJsonPath('error.code', 'INVALID_ORIGIN');
    test()->call('POST', '/api/auth/login', [], [], [], ['CONTENT_TYPE' => 'text/plain', 'HTTP_ORIGIN' => 'https://app.example.com'], '{"email":"a@b.c","password":"x"}')
        ->assertStatus(400)->assertJsonPath('error.code', 'INVALID_JSON');
    expect(RateLimitBuckets::count())->toBe(0);
});

it('takes the credential fence when the account exists', function () {
    $user = L::user();
    $statements = [];
    DB::listen(function ($q) use (&$statements) {
        $statements[] = $q->sql;
    });

    L::post(['email' => $user->email, 'password' => L::PASSWORD])->assertOk();

    expect(collect($statements)->contains(fn ($s) => str_contains($s, 'pg_advisory_xact_lock')))->toBeTrue();
});

it('has no registration and no remember-me', function () {
    config(['portal.public_site_url' => 'https://app.example.com']);
    test()->withHeaders(['Origin' => 'https://app.example.com'])->postJson('/api/auth/register', [])->assertNotFound();
    $this->get('/register')->assertNotFound();
    $user = L::user();
    $r = L::post(['email' => $user->email, 'password' => L::PASSWORD, 'remember' => true]);
    $r->assertOk();
    expect(DB::table('users')->where('id', $user->id)->count())->toBe(1);
});
