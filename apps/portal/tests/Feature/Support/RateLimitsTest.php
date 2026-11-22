<?php

use App\Support\RateLimitKeys;
use App\Support\RateLimits;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\Event;
use Tests\Support\RateLimitBuckets as Buckets;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 2.5 AC 1, 3-6 (X-06, ADR-009): the auth mode, as lib/auth/rate-limit.ts. Truncation harness, not the
// transaction wrapper: pgsql_limits writes commit on their own, and the AC 2 guard refuses an open transaction.
uses(TruncatesDatabaseAsOwner::class);

const RL_SCOPE = '/api/auth/magic-link';
const RL_ADDRESS = '203.0.113.9';
const RL_T0 = 1_700_000_000_000;

beforeEach(fn () => $this->travelTo(Buckets::at(RL_T0)));

it('stores only sha256 keys, never the email or address in clear', function () {
    RateLimits::reserveLogin(RL_ADDRESS, 'owner@example.com');
    RateLimits::consumeAuth(RL_SCOPE, RL_ADDRESS, 'owner@example.com');

    expect(Buckets::keys())->toEqualCanonicalizing([
        RateLimitKeys::hash('/api/auth/login:address:'.RL_ADDRESS),
        RateLimitKeys::hash('login:failures:owner@example.com:'.RL_ADDRESS),
        RateLimitKeys::hash(RL_SCOPE.':address:'.RL_ADDRESS),
        RateLimitKeys::hash(RL_SCOPE.':identity:owner@example.com'),
    ])->each->toMatch('/^[0-9a-f]{64}$/');
});

it('counts in a fixed 15-minute window that resets only after it has passed', function () {
    $identity = RL_SCOPE.':identity:a@example.com';
    RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com');
    expect(Buckets::row($identity))->toBe(['hits' => 1, 'windowStart' => Buckets::at(RL_T0)->format('Y-m-d H:i:s.v')]);

    $this->travelTo(Buckets::at(RL_T0 + 900_000)); // window_start == now - window: still active (strict < as Next)
    RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com');
    expect(Buckets::row($identity))->toBe(['hits' => 2, 'windowStart' => Buckets::at(RL_T0)->format('Y-m-d H:i:s.v')]);

    $this->travelTo(Buckets::at(RL_T0 + 900_001));
    RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com');
    expect(Buckets::row($identity))->toBe(['hits' => 1, 'windowStart' => Buckets::at(RL_T0 + 900_001)->format('Y-m-d H:i:s.v')]);
});

it('allows 5 per identity, then denies; a new window allows again', function () {
    $results = array_map(fn () => RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com')->allowed, range(1, 6));

    expect($results)->toBe([true, true, true, true, true, false])
        ->and(RateLimits::consumeAuth(RL_SCOPE, null, 'b@example.com')->allowed)->toBeTrue()
        ->and(RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com')->retryAfterSeconds)->toBeNull();

    $this->travelTo(Buckets::at(RL_T0 + 900_001));
    expect(RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com')->allowed)->toBeTrue();
});

it('lowercases the identity of the general limit, as allowAuthAttempt does', function () {
    RateLimits::consumeAuth(RL_SCOPE, null, 'A@Example.COM');
    RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com');

    expect(Buckets::hits(RL_SCOPE.':identity:a@example.com'))->toBe(2)->and(Buckets::count())->toBe(1);
});

it('allows 20 per trusted address across identities, then denies a fresh identity', function () {
    foreach (range(1, 20) as $i) {
        expect(RateLimits::consumeAuth(RL_SCOPE, RL_ADDRESS, "user{$i}@example.com")->allowed)->toBeTrue();
    }

    expect(RateLimits::consumeAuth(RL_SCOPE, RL_ADDRESS, 'fresh@example.com')->allowed)->toBeFalse()
        ->and(RateLimits::consumeAuth(RL_SCOPE, '198.51.100.7', 'fresh@example.com')->allowed)->toBeTrue()
        ->and(RateLimits::consumeAuth('/api/auth/forgot-password', RL_ADDRESS, 'fresh@example.com')->allowed)->toBeTrue();
});

it('hits every bucket even when one is already over (no short-circuit)', function () {
    // The address bucket (hit first) is the one already over; the identity bucket after it must still be hit.
    Buckets::seed(RL_SCOPE.':address:'.RL_ADDRESS, RateLimits::ADDRESS_LIMIT, Buckets::at(RL_T0 - 1000));

    expect(RateLimits::consumeAuth(RL_SCOPE, RL_ADDRESS, 'a@example.com')->allowed)->toBeFalse()
        ->and(Buckets::hits(RL_SCOPE.':address:'.RL_ADDRESS))->toBe(RateLimits::ADDRESS_LIMIT + 1)
        ->and(Buckets::hits(RL_SCOPE.':identity:a@example.com'))->toBe(1);
});

it('caps the counter at 100000', function () {
    Buckets::seed(RL_SCOPE.':identity:a@example.com', 100000, Buckets::at(RL_T0 - 1000));

    expect(RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com')->allowed)->toBeFalse()
        ->and(Buckets::hits(RL_SCOPE.':identity:a@example.com'))->toBe(100000);
});

it('reserves login failures per email and address: 5, then denied', function () {
    $results = array_map(fn () => RateLimits::reserveLogin(RL_ADDRESS, 'a@example.com')->allowed, range(1, 6));

    expect($results)->toBe([true, true, true, true, true, false])
        ->and(Buckets::hits('login:failures:a@example.com:'.RL_ADDRESS))->toBe(6)
        ->and(Buckets::hits('/api/auth/login:address:'.RL_ADDRESS))->toBe(6)
        ->and(RateLimits::reserveLogin('198.51.100.7', 'a@example.com')->allowed)->toBeTrue();
});

it('uses only the failure bucket, keyed unknown-address, when no trusted address is known', function () {
    RateLimits::reserveLogin(null, 'a@example.com');
    RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com');

    expect(Buckets::keys())->toEqualCanonicalizing([
        RateLimitKeys::hash('login:failures:a@example.com:unknown-address'),
        RateLimitKeys::hash(RL_SCOPE.':identity:a@example.com'),
    ]);
});

it('clears only the failure bucket of that email and address', function () {
    RateLimits::reserveLogin(RL_ADDRESS, 'a@example.com');
    RateLimits::reserveLogin(RL_ADDRESS, 'b@example.com');
    RateLimits::reserveLogin(null, 'a@example.com');

    RateLimits::clearLoginFailures(RL_ADDRESS, 'a@example.com');

    expect(Buckets::hits('login:failures:a@example.com:'.RL_ADDRESS))->toBeNull()
        ->and(Buckets::hits('login:failures:b@example.com:'.RL_ADDRESS))->toBe(1)
        ->and(Buckets::hits('login:failures:a@example.com:unknown-address'))->toBe(1)
        ->and(Buckets::hits('/api/auth/login:address:'.RL_ADDRESS))->toBe(2);
});

it('prunes rows whose window started more than an hour ago, and keeps the rest', function () {
    Buckets::seed('old', 3, Buckets::at(RL_T0 - 3_600_001));
    Buckets::seed('hour', 3, Buckets::at(RL_T0 - 3_600_000));
    Buckets::seed('active', 3, Buckets::at(RL_T0 - 60_000));

    RateLimits::consumeAuth(RL_SCOPE, null, 'a@example.com');

    expect(Buckets::hits('old'))->toBeNull()->and(Buckets::hits('hour'))->toBe(3)->and(Buckets::hits('active'))->toBe(3);
});

it('reads and writes buckets only on pgsql_limits', function () {
    $connections = [];
    Event::listen(QueryExecuted::class, function (QueryExecuted $query) use (&$connections) {
        if (str_contains($query->sql, 'auth_rate_limits')) {
            $connections[] = $query->connectionName;
        }
    });

    RateLimits::consumeAuth(RL_SCOPE, RL_ADDRESS, 'a@example.com');
    RateLimits::reserveLogin(RL_ADDRESS, 'a@example.com');
    RateLimits::clearLoginFailures(RL_ADDRESS, 'a@example.com');
    RateLimits::consumeCheckoutEmail('cs_1', 'a@example.com');

    expect($connections)->not->toBeEmpty()->and(array_unique($connections))->toBe(['pgsql_limits']);
});
