<?php

namespace App\Support;

use Closure;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB as Database;
use InvalidArgumentException;
use LogicException;
use PDOException;
use Throwable;

/**
 * Story 2.4 (ADR-011, X-17, NFR-R3): lifecycle transactions on the runtime connection.
 *
 * - serializable(): one SERIALIZABLE transaction, retried as a whole on 40001/40P01, never nested.
 * - guardedProjectUpdate(): the `projects.version` optimistic guard; the only code that moves `version`.
 *
 * Next ran these routes in Prisma Serializable transactions without retrying (P2034/P2028 → 409 at once);
 * Laravel retries, then throws the route's existing 409 (ADR-011 Consequences).
 */
final class Db
{
    /** Attempts in total, the first included (story 2.4 OQ 3). */
    public const MAX_ATTEMPTS = 3;

    /** Jittered pause between attempts, in microseconds (story 2.4 OQ 3). */
    public const BACKOFF_MIN_US = 10_000;

    public const BACKOFF_MAX_US = 50_000;

    /** SET LOCAL timeouts (story 2.4 OQ 2; Next: Prisma maxWait 2 s / timeout 5 s → P2028 → 409). */
    public const LOCK_TIMEOUT = '5s';

    public const STATEMENT_TIMEOUT = '5s';

    /** serialization_failure, deadlock_detected: the whole transaction is retried. */
    private const RETRYABLE = ['40001', '40P01'];

    /** lock_not_available (lock_timeout), query_canceled (statement_timeout): the caller's conflict, no retry. */
    private const TIMEOUTS = ['55P03', '57014'];

    /**
     * Runs $work in a SERIALIZABLE transaction on the runtime connection and returns its result.
     *
     * $work may run up to MAX_ATTEMPTS times: it must not have side effects outside the database. Queue mail,
     * storage cleanup and external calls with Database::afterCommit() (a rolled-back attempt discards them).
     * On exhausted retries, or a lock/statement timeout, throws $conflict: the 409 the route returns today for a
     * serialization failure (story 2.4 Decided), or a closure that builds it.
     * Any other error propagates unchanged, without a retry.
     *
     * @template T
     *
     * @param  Closure(Connection): T  $work
     * @param  Throwable|Closure(): Throwable  $conflict
     * @return T
     *
     * @throws LogicException when a transaction is already open on the runtime connection (no nesting)
     */
    public static function serializable(Closure $work, Throwable|Closure $conflict): mixed
    {
        $db = Database::connection(DatabaseRoles::RUNTIME);
        $level = $db->transactionLevel();
        if ($level > 0) {
            throw new LogicException("Db::serializable() must not nest: a transaction is already open on the runtime connection (level {$level}).");
        }

        for ($attempt = 1; ; $attempt++) {
            try {
                return $db->transaction(function (Connection $db) use ($work): mixed {
                    // Must be the first statement of the transaction.
                    $db->statement('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
                    $db->statement("SET LOCAL lock_timeout = '".self::LOCK_TIMEOUT."'");
                    $db->statement("SET LOCAL statement_timeout = '".self::STATEMENT_TIMEOUT."'");

                    return $work($db);
                });
            } catch (Throwable $e) {
                // A failed COMMIT throws from PDO directly; make sure nothing is left open before retrying.
                if ($db->transactionLevel() === 0 && $db->getPdo()->inTransaction()) {
                    $db->getPdo()->rollBack();
                }
                $state = self::sqlState($e);
                if (in_array($state, self::TIMEOUTS, true)
                    || (in_array($state, self::RETRYABLE, true) && $attempt >= self::MAX_ATTEMPTS)) {
                    throw $conflict instanceof Closure ? $conflict() : $conflict;
                }
                if (! in_array($state, self::RETRYABLE, true)) {
                    throw $e;
                }
                usleep(random_int(self::BACKOFF_MIN_US, self::BACKOFF_MAX_US));
            }
        }
    }

    /**
     * The version guard (ADR-011): `UPDATE projects SET <values>, version = version + 1, updated_at = now
     * WHERE id = ? AND status = ? AND version = ?`. Throws $conflict (the route's version-guard code, e.g.
     * STATUS_CHANGE_CONFLICT) unless exactly one row changed. Returns the new version.
     *
     * @param  array<string, mixed>  $values  columns to set (e.g. ['status' => 'ON_HOLD']); never `id` or `version`
     * @param  Throwable|Closure(): Throwable  $conflict
     */
    public static function guardedProjectUpdate(string $projectId, string $expectedStatus, int $expectedVersion, array $values, Throwable|Closure $conflict): int
    {
        foreach (['id', 'version'] as $column) {
            if (array_key_exists($column, $values)) {
                throw new InvalidArgumentException("guardedProjectUpdate() sets projects.{$column} itself.");
            }
        }

        $affected = Database::connection(DatabaseRoles::RUNTIME)->table('projects')
            ->where('id', $projectId)
            ->where('status', $expectedStatus)
            ->where('version', $expectedVersion)
            ->update([...['updated_at' => now()], ...$values, 'version' => Database::raw('version + 1')]);

        if ($affected !== 1) {
            throw $conflict instanceof Closure ? $conflict() : $conflict;
        }

        return $expectedVersion + 1;
    }

    /** The SQLSTATE of a database error, or null for anything else (domain exceptions are never retried). */
    public static function sqlState(Throwable $e): ?string
    {
        if (! $e instanceof QueryException && ! $e instanceof PDOException) {
            return null;
        }
        $state = $e->errorInfo[0] ?? $e->getCode();

        return is_string($state) && $state !== '' ? $state : null;
    }
}
