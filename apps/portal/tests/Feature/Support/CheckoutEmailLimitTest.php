<?php

use App\Support\RateLimitResult;
use App\Support\RateLimits;
use Tests\Support\RateLimitBuckets as Buckets;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 2.5 AC 10 (X-06, K-04, ADR-009): the checkout email mode. Port of apps/web
// src/lib/checkout-auth-email-rate-limit.test.ts (ledger #79, 3 tests) with Next's expected values; Next's
// `now` (epoch ms) is the frozen application clock here. Plus the all-or-nothing and fixed-window rules.
uses(TruncatesDatabaseAsOwner::class);

/** @return array{allowed: bool, retryAfterSeconds?: int} Next's LimitResult shape */
function checkoutSend(string $sessionId, string $destination, int $nowMs): array
{
    test()->travelTo(Buckets::at($nowMs));
    $result = RateLimits::consumeCheckoutEmail($sessionId, $destination);

    return $result->allowed ? ['allowed' => true] : ['allowed' => false, 'retryAfterSeconds' => (int) $result->retryAfterSeconds];
}

const CL_SESSION = 'checkout:session:';
const CL_DESTINATION = 'checkout:destination:';

// #79 test 1 (checkout-auth-email-rate-limit.test.ts:13-23)
it('enforces a shared per-session ceiling across send paths', function () {
    $now = 1_000_000;

    expect(checkoutSend('cs_shared', 'buyer@example.com', $now))->toBe(['allowed' => true])
        ->and(checkoutSend('cs_shared', 'buyer@example.com', $now + 1))->toBe(['allowed' => true])
        ->and(checkoutSend('cs_shared', 'buyer@example.com', $now + 2))->toBe(['allowed' => true])
        ->and(checkoutSend('cs_shared', 'buyer@example.com', $now + 3))->toBe(['allowed' => false, 'retryAfterSeconds' => 900]);
});

// #79 test 2 (:25-43)
it('enforces a destination ceiling across different session ids', function () {
    foreach (range(0, 4) as $index) {
        expect(checkoutSend("cs_{$index}", 'same@example.com', 2_000_000 + $index))->toBe(['allowed' => true]);
    }

    expect(checkoutSend('cs_sixth', ' SAME@example.com ', 2_000_006))->toBe(['allowed' => false, 'retryAfterSeconds' => 3600]);
});

// #79 test 3 (:45-57)
it('expires old entries and permits a later send', function () {
    foreach (range(0, 2) as $index) {
        checkoutSend('cs_expiring', 'buyer@example.com', $index);
    }

    expect(checkoutSend('cs_expiring', 'buyer@example.com', 15 * 60_000 + 1))->toBe(['allowed' => true]);
});

it('consumes and creates nothing in any bucket when a request is denied', function () {
    foreach (range(0, 2) as $index) {
        checkoutSend('cs_full', 'a@example.com', 1_000_000 + $index);
    }
    expect(checkoutSend('cs_full', 'b@example.com', 1_000_010)['allowed'])->toBeFalse()
        ->and(Buckets::row(CL_DESTINATION.'b@example.com'))->toBeNull()   // not burned by a session-blocked request
        ->and(Buckets::hits(CL_DESTINATION.'a@example.com'))->toBe(3)
        ->and(Buckets::hits(CL_SESSION.'cs_full'))->toBe(3);

    foreach (range(1, 2) as $index) {
        checkoutSend("cs_more{$index}", 'a@example.com', 1_000_020 + $index);
    }
    expect(checkoutSend('cs_late', 'a@example.com', 1_000_030)['allowed'])->toBeFalse()
        ->and(Buckets::row(CL_SESSION.'cs_late'))->toBeNull()             // no bucket row left behind by the denial
        ->and(Buckets::hits(CL_DESTINATION.'a@example.com'))->toBe(5);
});

it('starts a window at the first allowed send, and gives a full allowance once it has passed', function () {
    foreach (range(0, 2) as $index) {
        checkoutSend('cs_window', 'a@example.com', 1_000_000 + $index * 1000);
    }

    expect(checkoutSend('cs_window', 'a@example.com', 1_000_000 + 899_999))->toBe(['allowed' => false, 'retryAfterSeconds' => 1])
        ->and(checkoutSend('cs_window', 'a@example.com', 1_000_000 + 900_000))->toBe(['allowed' => true])
        ->and(Buckets::row(CL_SESSION.'cs_window'))->toBe(['hits' => 1, 'windowStart' => Buckets::at(1_900_000)->format('Y-m-d H:i:s.v')])
        ->and(Buckets::row(CL_DESTINATION.'a@example.com'))->toBe(['hits' => 4, 'windowStart' => Buckets::at(1_000_000)->format('Y-m-d H:i:s.v')]);
});

it('takes the retry-after from the session bucket when both buckets are blocked', function () {
    foreach (range(0, 2) as $index) {
        checkoutSend('cs_both', 'a@example.com', 1_000_000 + $index);
    }
    checkoutSend('cs_other1', 'a@example.com', 1_005_000);
    checkoutSend('cs_other2', 'a@example.com', 1_005_001);

    expect(checkoutSend('cs_both', 'a@example.com', 1_010_000))->toBe(['allowed' => false, 'retryAfterSeconds' => 890])
        ->and(checkoutSend('cs_new', 'a@example.com', 1_010_000))->toBe(['allowed' => false, 'retryAfterSeconds' => 3590]);
});

it('leaves an active 60-minute destination bucket alone when pruning', function () {
    checkoutSend('cs_a', 'a@example.com', 10_000_000);
    checkoutSend('cs_b', 'b@example.com', 10_000_000 + 59 * 60_000);

    expect(Buckets::hits(CL_DESTINATION.'a@example.com'))->toBe(1)
        ->and(Buckets::hits(CL_SESSION.'cs_a'))->toBe(1); // expired at 15 minutes, still within the 1-hour prune

    checkoutSend('cs_c', 'b@example.com', 10_000_000 + 3_600_001);
    expect(Buckets::row(CL_DESTINATION.'a@example.com'))->toBeNull()->and(Buckets::row(CL_SESSION.'cs_a'))->toBeNull();
});

it('returns the result value with a retry-after only on a denial', function () {
    $this->travelTo(Buckets::at(1_000_000));
    $results = array_map(fn () => RateLimits::consumeCheckoutEmail('cs_r', 'r@example.com'), range(1, 4));

    expect($results)->each->toBeInstanceOf(RateLimitResult::class)
        ->and(array_map(fn (RateLimitResult $r) => [$r->allowed, $r->retryAfterSeconds], $results))
        ->toBe([[true, null], [true, null], [true, null], [false, 900]]);
});
