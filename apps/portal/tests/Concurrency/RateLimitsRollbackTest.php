<?php

use App\Support\RateLimits;
use Illuminate\Support\Facades\DB;
use Tests\Support\RateLimitBuckets as Buckets;

// Story 2.5 AC 7 (NFR-S4, @pg-race): a failed login whose fence/business transaction rolls back still counts,
// because the hit was committed on pgsql_limits before the transaction on pgsql opened.

function failedLoginAttempt(string $email): bool
{
    $reserved = RateLimits::reserveLogin('203.0.113.9', $email);
    if (! $reserved->allowed) {
        return false;
    }
    try {
        DB::connection('pgsql')->transaction(function () {
            DB::connection('pgsql')->select('SELECT pg_advisory_xact_lock(25006)'); // as Locks::credential() would
            throw new RuntimeException('wrong password');
        });
    } catch (RuntimeException) {
        // the fence rolled back
    }

    return true;
}

it('keeps the hit when the business transaction rolls back', function () {
    expect(failedLoginAttempt('victim@example.com'))->toBeTrue()
        ->and(DB::connection('pgsql')->transactionLevel())->toBe(0)
        ->and(Buckets::hits('login:failures:victim@example.com:203.0.113.9'))->toBe(1)
        ->and(Buckets::hits('/api/auth/login:address:203.0.113.9'))->toBe(1);
});

it('denies once rolled-back failures reach the cap', function () {
    $attempts = array_map(fn () => failedLoginAttempt('victim@example.com'), range(1, 6));

    expect($attempts)->toBe([true, true, true, true, true, false])
        ->and(Buckets::hits('login:failures:victim@example.com:203.0.113.9'))->toBe(6);
});
