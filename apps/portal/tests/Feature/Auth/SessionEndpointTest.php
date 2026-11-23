<?php

use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Support\SessionRows;

// Story 4.1 AC 1, 3-6, 8, 10 (A-03, A-04; ledger #30; contract auth-session.spec.ts:18-38).

// Laravel only accepts a 40-character alphanumeric id.
const SESSION_ID = 'abcdefghijabcdefghijabcdefghijabcdefghij';

beforeEach(function () {
    config(['session.driver' => 'database', 'session.lifetime' => 10080]); // the 7-day cap, whatever a local .env says
    Carbon::setTestNow('2026-11-22 12:00:00');
});

afterEach(fn () => Carbon::setTestNow());

function sessionFor(User $user, int $issuedAgo, string $id = SESSION_ID): void
{
    SessionRows::insert($id, $user->id, now()->getTimestamp() - $issuedAgo, now()->getTimestamp());
}

function getSession(string $id = SESSION_ID)
{
    return test()->withCredentials()->withCookie(config('session.cookie'), $id)->getJson('/api/auth/session');
}

it('answers unauthenticated without a session', function () {
    $this->getJson('/api/auth/session')->assertOk()->assertExactJson(['authenticated' => false]);
});

it('returns the signed-in identity', function () {
    $profile = Profile::factory()->create();
    sessionFor($profile->user, 60);

    getSession()->assertOk()->assertExactJson([
        'authenticated' => true,
        'userId' => $profile->id,
        'email' => $profile->email,
        'isAdmin' => false,
    ]);
});

it('enforces the absolute cap at the boundary', function (int $age, bool $live) {
    $user = User::factory()->create();
    sessionFor($user, $age);

    getSession()->assertOk()->assertJsonPath('authenticated', $live);
    // Open question 2: a rejected session row is deleted on the first read.
    expect(DB::table('sessions')->where('id', SESSION_ID)->exists())->toBe($live);
})->with([
    '6d 23h 59m 59s' => [604799, true],
    'exactly 7d' => [604800, false],
    '7d + 1s' => [604801, false],
]);

it('never slides: use on day 6 does not move the end', function () {
    $user = User::factory()->create();
    sessionFor($user, 0);

    Carbon::setTestNow(now()->addDays(6));
    getSession()->assertJsonPath('authenticated', true);
    Carbon::setTestNow(now()->addDays(1)->subSecond());
    getSession()->assertJsonPath('authenticated', true);
    $payload = json_decode((string) base64_decode((string) DB::table('sessions')->where('id', SESSION_ID)->value('payload')), true);
    expect($payload['auth']['issued_at'])->toBe(Carbon::parse('2026-11-22 12:00:00')->getTimestamp());

    Carbon::setTestNow(now()->addSecond()); // exactly day 7 after issue
    getSession()->assertExactJson(['authenticated' => false]);
});

it('does not treat an unverified mailbox as a session', function () {
    $user = User::factory()->unverified()->create();
    sessionFor($user, 10);

    getSession()->assertExactJson(['authenticated' => false]);
});

it('reads isAdmin from the database on every request', function () {
    $profile = Profile::factory()->create();
    sessionFor($profile->user, 10);
    getSession()->assertJsonPath('isAdmin', false);

    DB::connection('pgsql_migrate')->table('profiles')->where('id', $profile->id)->update(['is_admin' => true]);
    getSession()->assertJsonPath('isAdmin', true);

    // An unverified admin is an ordinary user (admin.ts:4): the verified flag is read live too.
    DB::connection('pgsql_migrate')->table('users')->where('id', $profile->id)->update(['email_verified_at' => null]);
    getSession()->assertExactJson(['authenticated' => false]);
});

it('answers 503 and leaks nothing when the lookup fails', function () {
    $user = User::factory()->create();
    sessionFor($user, 10);
    DB::connection()->beforeExecuting(function (string $query) {
        if (str_contains($query, 'from "users"')) {
            throw new RuntimeException('SQLSTATE[08006] password=hunter2 at db.internal');
        }
    });

    $res = getSession()->assertStatus(503);
    expect($res->json())->toBe(['error' => ['code' => 'SESSION_VERIFICATION_UNAVAILABLE', 'message' => 'Could not verify session. Please retry.']])
        ->and($res->getContent())->not->toContain('hunter2')->not->toContain('SQLSTATE')
        ->and($res->headers->get('Cache-Control'))->toBe('no-store');
});

it('carries no-store and the site referrer policy', function () {
    $res = $this->getJson('/api/auth/session');

    expect($res->headers->get('Cache-Control'))->toBe('no-store')
        ->and($res->headers->get('Referrer-Policy'))->toBe('strict-origin-when-cross-origin');
});

it('answers 503 AUTH_UNAVAILABLE in production without a trusted address, before any session lookup', function () {
    app()->detectEnvironment(fn () => 'production');
    $queries = [];
    DB::listen(function ($q) use (&$queries) {
        $queries[] = $q->sql;
    });

    $this->getJson('/api/auth/session')->assertStatus(503)->assertJsonPath('error.code', 'AUTH_UNAVAILABLE');
    expect($queries)->toBe([]);
});

it('adds only the session and login auth routes', function () {
    $auth = collect(app('router')->getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/auth'))
        ->map(fn ($r) => implode('|', array_diff($r->methods(), ['HEAD'])).' '.$r->uri())->values()->all();

    expect($auth)->toBe(['GET api/auth/session', 'POST api/auth/login', 'POST api/auth/magic-link', 'POST api/auth/forgot-password', 'POST api/auth/magic-link/verify']);
});
