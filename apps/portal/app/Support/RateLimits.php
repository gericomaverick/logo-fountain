<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use LogicException;
use stdClass;
use Throwable;

/**
 * Story 2.5 (X-06, ADR-009, NFR-S4): the shared PostgreSQL rate-limit store. Buckets live in
 * `auth_rate_limits` and are read and written only here, only on the `pgsql_limits` connection, and never
 * inside a transaction on `pgsql` (business transactions, `Db::serializable()`, `Locks`): a hit commits on
 * its own, so a rolled-back business transaction can't undo it. Call it before the fence/business transaction.
 *
 * Two modes, as Next has two limiters:
 * - auth (`lib/auth/rate-limit.ts`): one atomic upsert per bucket, every bucket hit even when one is over,
 *   allowed/denied only, 15-minute fixed window;
 * - checkout email (`lib/checkout-auth-email-rate-limit.ts`): all-or-nothing (a denial consumes and creates
 *   nothing), per-bucket windows, retry-after from the first blocked bucket. Fixed window from a bucket's first
 *   send, not Next's sliding window (owner decision, story 2.5 open question 2b).
 *
 * The clock is the application clock (`now()`, frozen in tests), truncated to the column's milliseconds.
 */
final class RateLimits
{
    public const AUTH_WINDOW_SECONDS = 900;

    public const ADDRESS_LIMIT = 20;

    public const IDENTITY_LIMIT = 5;

    public const LOGIN_FAILURE_LIMIT = 5;

    public const CHECKOUT_SESSION_LIMIT = 3;

    public const CHECKOUT_SESSION_WINDOW_SECONDS = 900;

    public const CHECKOUT_DESTINATION_LIMIT = 5;

    public const CHECKOUT_DESTINATION_WINDOW_SECONDS = 3600;

    /** Rows whose window started longer ago are deleted on every consume. Must be ≥ the longest window. */
    public const PRUNE_AFTER_SECONDS = 3600;

    /** Hits stop counting here, so the integer column can't overflow (`rate-limit.ts:17`). */
    public const MAX_HITS = 100000;

    private const TABLE = 'auth_rate_limits';

    private const HIT = <<<'SQL'
        INSERT INTO auth_rate_limits (key, hits, window_start) VALUES (?, 1, ?)
        ON CONFLICT (key) DO UPDATE SET
            hits = CASE WHEN auth_rate_limits.window_start < ? THEN 1 ELSE LEAST(auth_rate_limits.hits + 1, ?) END,
            window_start = CASE WHEN auth_rate_limits.window_start < ? THEN EXCLUDED.window_start ELSE auth_rate_limits.window_start END
        RETURNING hits
        SQL;

    /**
     * General auth limit (Next `allowAuthAttempt` → `consumeAuthLimit`): scope is the request path; the address
     * bucket applies only when a trusted client address is known. The identity is lowercased here.
     */
    public static function consumeAuth(string $scope, ?string $address, string $identity): RateLimitResult
    {
        self::assertOutsideTransactions();
        $buckets = [];
        if ($address !== null && $address !== '') {
            $buckets[] = [RateLimitKeys::authAddress($scope, $address), self::ADDRESS_LIMIT];
        }
        $buckets[] = [RateLimitKeys::authIdentity($scope, NodeCompat::lower($identity)), self::IDENTITY_LIMIT];

        return self::hitAll($buckets);
    }

    /** Login: the address bucket counts every attempt; the failure bucket is reserved before the password check. */
    public static function reserveLogin(?string $address, string $email): RateLimitResult
    {
        self::assertOutsideTransactions();
        $buckets = [];
        if ($address !== null && $address !== '') {
            $buckets[] = [RateLimitKeys::loginAddress($address), self::ADDRESS_LIMIT];
        }
        $buckets[] = [RateLimitKeys::loginFailures($address, $email), self::LOGIN_FAILURE_LIMIT];

        return self::hitAll($buckets);
    }

    /** A successful sign-in gives the failure budget back (the address bucket keeps its count). */
    public static function clearLoginFailures(?string $address, string $email): void
    {
        self::assertOutsideTransactions();
        self::db()->table(self::TABLE)->where('key', RateLimitKeys::hash(RateLimitKeys::loginFailures($address, $email)))->delete();
    }

    /**
     * Checkout authentication emails (ledger #79): at most 3 per session in 15 minutes and 5 per destination in
     * 60 minutes. Call before sending; a failed send still counts.
     */
    public static function consumeCheckoutEmail(string $sessionId, string $destination): RateLimitResult
    {
        self::assertOutsideTransactions();

        return self::consumeAllOrNothing([
            [RateLimitKeys::checkoutSession($sessionId), self::CHECKOUT_SESSION_LIMIT, self::CHECKOUT_SESSION_WINDOW_SECONDS],
            [RateLimitKeys::checkoutDestination($destination), self::CHECKOUT_DESTINATION_LIMIT, self::CHECKOUT_DESTINATION_WINDOW_SECONDS],
        ]);
    }

    /**
     * Each upsert is one atomic autocommit statement; a wrapping transaction would add nothing.
     *
     * @param  list<array{0: string, 1: int}>  $buckets  logical key, cap
     */
    private static function hitAll(array $buckets): RateLimitResult
    {
        $now = self::now();
        self::prune($now);
        $at = self::timestamp($now);
        $cutoff = self::timestamp($now->subSeconds(self::AUTH_WINDOW_SECONDS));
        $allowed = true;
        foreach ($buckets as [$logical, $cap]) {
            $row = self::db()->selectOne(self::HIT, [RateLimitKeys::hash($logical), $at, $cutoff, self::MAX_HITS, $cutoff]);
            if (self::int($row, 'hits') > $cap) {
                $allowed = false; // no short-circuit: every bucket is hit (rate-limit.ts:27)
            }
        }

        return $allowed ? RateLimitResult::allowed() : RateLimitResult::denied();
    }

    /**
     * One transaction owned by this service: lock every bucket in key order (two requests sharing a bucket
     * can't deadlock), then update all of them or, on a denial, roll back so nothing is consumed or created.
     *
     * @param  list<array{0: string, 1: int, 2: int}>  $buckets  logical key, cap, window seconds; in Next's order
     */
    private static function consumeAllOrNothing(array $buckets): RateLimitResult
    {
        $now = self::now();
        self::prune($now);
        $at = self::timestamp($now);
        $nowMs = $now->getTimestampMs();
        $keys = array_map(fn (array $bucket): string => RateLimitKeys::hash($bucket[0]), $buckets);
        $sorted = $keys;
        sort($sorted);

        $db = self::db();
        $db->beginTransaction();
        try {
            $rows = [];
            foreach ($sorted as $key) {
                // One statement creates-or-locks the row, so a concurrent cleanup can't delete it in between.
                $row = $db->selectOne('INSERT INTO auth_rate_limits (key, hits, window_start) VALUES (?, 0, ?) ON CONFLICT (key) DO UPDATE SET hits = auth_rate_limits.hits RETURNING hits, window_start', [$key, $at]);
                $rows[$key] = ['hits' => self::int($row, 'hits'), 'startMs' => self::timestampMs($row, 'window_start')];
            }

            $effective = [];
            foreach ($buckets as $index => [, $cap, $window]) {
                $row = $rows[$keys[$index]];
                $endsMs = $row['startMs'] + $window * 1000;
                $effective[$index] = $endsMs <= $nowMs ? 0 : $row['hits'];
                if ($effective[$index] >= $cap) {
                    $db->rollBack();

                    return RateLimitResult::denied(max(1, (int) ceil(($endsMs - $nowMs) / 1000)));
                }
            }

            foreach ($keys as $index => $key) {
                // A bucket with no live hits starts its window at this send, not at a request it once denied.
                $db->table(self::TABLE)->where('key', $key)->update($effective[$index] === 0
                    ? ['hits' => 1, 'window_start' => $at]
                    : ['hits' => $effective[$index] + 1]);
            }
            $db->commit();
        } catch (Throwable $e) {
            if ($db->transactionLevel() > 0) {
                $db->rollBack();
            }
            throw $e;
        }

        return RateLimitResult::allowed();
    }

    private static function prune(CarbonImmutable $now): void
    {
        // SKIP LOCKED: never wait on (or deadlock with) a row another request's transaction holds.
        self::db()->delete(
            'DELETE FROM auth_rate_limits WHERE key IN (SELECT key FROM auth_rate_limits WHERE window_start < ? FOR UPDATE SKIP LOCKED)',
            [self::timestamp($now->subSeconds(self::PRUNE_AFTER_SECONDS))],
        );
    }

    /** AC 2/9: a hit inside a transaction would be rolled back with it, or held under a business lock. */
    private static function assertOutsideTransactions(): void
    {
        $business = DB::connection(DatabaseRoles::RUNTIME)->transactionLevel();
        $limits = self::db()->transactionLevel();
        if ($business !== 0 || $limits !== 0) {
            throw new LogicException(sprintf(
                'RateLimits must be called outside every transaction (pgsql level %d, pgsql_limits level %d): call it before the business transaction or Locks (ADR-009).',
                $business,
                $limits,
            ));
        }
    }

    private static function db(): Connection
    {
        return DB::connection(DatabaseRoles::LIMITS);
    }

    private static function now(): CarbonImmutable
    {
        return CarbonImmutable::createFromTimestampMs(now()->getTimestampMs(), 'UTC');
    }

    private static function timestamp(CarbonImmutable $at): string
    {
        return $at->utc()->format('Y-m-d H:i:s.v');
    }

    private static function int(mixed $row, string $column): int
    {
        $value = $row instanceof stdClass ? ($row->{$column} ?? null) : null;
        if (! is_int($value) && ! (is_string($value) && ctype_digit($value))) {
            throw new LogicException("auth_rate_limits.{$column}: unexpected value");
        }

        return (int) $value;
    }

    private static function timestampMs(mixed $row, string $column): int
    {
        $value = $row instanceof stdClass ? ($row->{$column} ?? null) : null;
        if (! is_string($value)) {
            throw new LogicException("auth_rate_limits.{$column}: unexpected value");
        }

        return CarbonImmutable::parse($value, 'UTC')->getTimestampMs();
    }
}
