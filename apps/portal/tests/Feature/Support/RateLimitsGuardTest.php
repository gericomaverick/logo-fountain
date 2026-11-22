<?php

use App\Support\Db;
use App\Support\RateLimits;
use Illuminate\Support\Facades\DB;
use Tests\Support\RateLimitBuckets as Buckets;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 2.5 AC 2, AC 9 (X-06, ADR-009): every public method refuses to run inside a transaction on pgsql
// (business transactions, Db::serializable(), Locks::credential()) or on pgsql_limits, and writes nothing.
uses(TruncatesDatabaseAsOwner::class);

const RG_FAILURES = 'login:failures:a@example.com:203.0.113.9';

dataset('rate limit calls', [
    'consumeAuth' => [fn () => RateLimits::consumeAuth('/api/auth/magic-link', '203.0.113.9', 'a@example.com')],
    'reserveLogin' => [fn () => RateLimits::reserveLogin('203.0.113.9', 'a@example.com')],
    'clearLoginFailures' => [fn () => RateLimits::clearLoginFailures('203.0.113.9', 'a@example.com')],
    'consumeCheckoutEmail' => [fn () => RateLimits::consumeCheckoutEmail('cs_1', 'a@example.com')],
]);

beforeEach(fn () => Buckets::seed(RG_FAILURES, 2, now()->toImmutable()));

function expectRefusedInside(string $connection, Closure $call, string $levels): void
{
    try {
        DB::connection($connection)->transaction(function () use ($connection, $call) {
            if ($connection === 'pgsql') {
                DB::connection('pgsql')->select('SELECT pg_advisory_xact_lock(25007)'); // as Locks::credential() would
            }
            $call();
        });
    } catch (LogicException $e) {
        expect($e->getMessage())->toBe("RateLimits must be called outside every transaction ({$levels}): call it before the business transaction or Locks (ADR-009).")
            ->and(DB::connection('pgsql')->transactionLevel())->toBe(0)
            ->and(DB::connection('pgsql_limits')->transactionLevel())->toBe(0)
            ->and(Buckets::count())->toBe(1)
            ->and(Buckets::hits(RG_FAILURES))->toBe(2);

        return;
    }
    throw new RuntimeException('the call was not refused');
}

it('throws and writes nothing inside a business transaction on pgsql', function (Closure $call) {
    expectRefusedInside('pgsql', $call, 'pgsql level 1, pgsql_limits level 0');
})->with('rate limit calls');

it('throws and writes nothing inside Db::serializable()', function (Closure $call) {
    try {
        Db::serializable($call, new RuntimeException('unexpected conflict'));
    } catch (LogicException $e) {
        expect($e->getMessage())->toBe('RateLimits must be called outside every transaction (pgsql level 1, pgsql_limits level 0): call it before the business transaction or Locks (ADR-009).')
            ->and(DB::connection('pgsql')->transactionLevel())->toBe(0)
            ->and(Buckets::count())->toBe(1)
            ->and(Buckets::hits(RG_FAILURES))->toBe(2);

        return;
    }
    throw new RuntimeException('the call was not refused');
})->with('rate limit calls');

it('throws and writes nothing inside a transaction on pgsql_limits', function (Closure $call) {
    expectRefusedInside('pgsql_limits', $call, 'pgsql level 0, pgsql_limits level 1');
})->with('rate limit calls');

it('runs at level 0 on both connections, including after a committed business transaction', function (Closure $call) {
    DB::connection('pgsql')->transaction(fn () => DB::connection('pgsql')->select('SELECT 1'));
    $before = [Buckets::keys(), Buckets::hits(RG_FAILURES)];

    $call();

    expect([Buckets::keys(), Buckets::hits(RG_FAILURES)])->not->toBe($before);
})->with('rate limit calls');

it('lets the auth flow reserve before the fence and clear after it', function () {
    expect(RateLimits::reserveLogin('203.0.113.9', 'a@example.com')->allowed)->toBeTrue();
    DB::connection('pgsql')->transaction(fn () => DB::connection('pgsql')->select('SELECT pg_advisory_xact_lock(25007)'));
    RateLimits::clearLoginFailures('203.0.113.9', 'a@example.com');

    expect(Buckets::hits(RG_FAILURES))->toBeNull()->and(Buckets::hits('/api/auth/login:address:203.0.113.9'))->toBe(1);
});
