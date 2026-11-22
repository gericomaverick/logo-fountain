<?php

use App\Support\RateLimits;
use Tests\Support\RateLimitBuckets as Buckets;
use Tests\Support\RateLimitChildren;

// Story 2.5 AC 8, AC 10 (NFR-S4, @pg-race): N parallel processes (N > cap) on one bucket get exactly `cap`
// allowed, in both modes; two sessions sharing a destination neither deadlock nor overshoot.

function allowedCount(array $results): int
{
    return count(array_filter($results, fn (array $result) => $result['allowed']));
}

it('auth mode: 12 processes on one identity get exactly 5 allowed, and every hit is counted', function () {
    $results = RateLimitChildren::run(array_fill(0, 12, ['consumeAuth', ['/api/auth/magic-link', null, 'race@example.com']]));

    expect(allowedCount($results))->toBe(RateLimits::IDENTITY_LIMIT)
        ->and(Buckets::hits('/api/auth/magic-link:identity:race@example.com'))->toBe(12);
});

it('auth mode: 24 processes on one address with two buckets each get exactly 20 allowed', function () {
    $calls = array_map(fn (int $i) => ['consumeAuth', ['/api/auth/magic-link', '203.0.113.9', "race{$i}@example.com"]], range(1, 24));
    $results = RateLimitChildren::run($calls);

    expect(allowedCount($results))->toBe(RateLimits::ADDRESS_LIMIT)
        ->and(Buckets::hits('/api/auth/magic-link:address:203.0.113.9'))->toBe(24)
        ->and(Buckets::count())->toBe(25);
});

it('auth mode: 10 login reservations for one email and address get exactly 5 allowed', function () {
    $results = RateLimitChildren::run(array_fill(0, 10, ['reserveLogin', ['203.0.113.9', 'race@example.com']]));

    expect(allowedCount($results))->toBe(RateLimits::LOGIN_FAILURE_LIMIT)
        ->and(Buckets::hits('login:failures:race@example.com:203.0.113.9'))->toBe(10);
});

it('checkout mode: 8 processes on one session get exactly 3 allowed, and denials consume nothing', function () {
    $results = RateLimitChildren::run(array_fill(0, 8, ['consumeCheckoutEmail', ['cs_race', 'race@example.com']]));

    expect(allowedCount($results))->toBe(RateLimits::CHECKOUT_SESSION_LIMIT)
        ->and(Buckets::hits('checkout:session:cs_race'))->toBe(3)
        ->and(Buckets::hits('checkout:destination:race@example.com'))->toBe(3);
    foreach ($results as $result) {
        $result['allowed']
            ? expect($result['retryAfterSeconds'])->toBeNull()
            : expect($result['retryAfterSeconds'])->toBeGreaterThan(0)->toBeLessThanOrEqual(900);
    }
});

it('checkout mode: two sessions sharing a destination neither deadlock nor overshoot', function () {
    $calls = [];
    foreach (range(1, 10) as $i) {
        $calls[] = ['consumeCheckoutEmail', [$i % 2 === 0 ? 'cs_even' : 'cs_odd', 'shared@example.com']];
    }
    $results = RateLimitChildren::run($calls);

    expect($results)->toHaveCount(10)
        ->and(allowedCount($results))->toBe(RateLimits::CHECKOUT_DESTINATION_LIMIT)
        ->and(Buckets::hits('checkout:destination:shared@example.com'))->toBe(5)
        ->and(Buckets::hits('checkout:session:cs_even') + Buckets::hits('checkout:session:cs_odd'))->toBe(5)
        ->and(max(Buckets::hits('checkout:session:cs_even'), Buckets::hits('checkout:session:cs_odd')))->toBeLessThanOrEqual(3);
});
