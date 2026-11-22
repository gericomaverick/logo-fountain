<?php

namespace Tests\Support;

use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Story 2.5 (NFR-S4): run RateLimits calls in parallel child processes (separate PHP processes and
 * connections), released together by an advisory lock the parent holds until every child waits on it.
 */
final class RateLimitChildren
{
    private const BARRIER = 25005;

    private const TIMEOUT_SECONDS = 60;

    /**
     * @param  list<array{0: string, 1: list<string|null>}>  $calls  method, arguments
     * @return list<array{allowed: bool, retryAfterSeconds: int|null}>
     */
    public static function run(array $calls): array
    {
        $holder = DB::connection('pgsql_migrate');
        $holder->select('SELECT pg_advisory_lock(?)', [self::BARRIER]);
        $children = [];
        try {
            foreach ($calls as [$method, $arguments]) {
                $process = proc_open(
                    [PHP_BINARY, __DIR__.'/rate-limits-child.php', (string) self::BARRIER, $method, json_encode($arguments, JSON_THROW_ON_ERROR)],
                    [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                    $pipes,
                    base_path(),
                    self::environment(),
                );
                if ($process === false) {
                    throw new RuntimeException('could not start a child process');
                }
                $children[] = [$process, $pipes];
            }
            $ready = self::waitForWaiters(count($calls));
        } finally {
            $holder->select('SELECT pg_advisory_unlock(?)', [self::BARRIER]);
        }

        $results = [];
        $failures = [];
        foreach ($children as $index => [$process, $pipes]) {
            $out = (string) stream_get_contents($pipes[1]);
            $err = (string) stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            $exit = proc_close($process);
            $decoded = json_decode($out, true);
            if ($exit !== 0 || ! is_array($decoded)) {
                $failures[] = "child {$index} exited {$exit}: ".trim($out."\n".$err);

                continue;
            }
            $results[] = ['allowed' => (bool) $decoded['allowed'], 'retryAfterSeconds' => $decoded['retryAfterSeconds']];
        }
        if (! $ready || $failures !== []) {
            throw new RuntimeException(($ready ? '' : 'children did not all reach the barrier. ').implode("\n", $failures));
        }

        return $results;
    }

    private static function waitForWaiters(int $count): bool
    {
        $deadline = microtime(true) + self::TIMEOUT_SECONDS;
        while (microtime(true) < $deadline) {
            $waiting = DB::connection('pgsql_migrate')->scalar(
                "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND objid = ? AND NOT granted",
                [self::BARRIER],
            );
            if ((int) $waiting >= $count) {
                return true;
            }
            usleep(20_000);
        }

        return false;
    }

    /** @return array<string, string> the parent's environment, pinned to the parent's test database */
    private static function environment(): array
    {
        /** @var array<string, mixed> $pgsql */
        $pgsql = config('database.connections.pgsql');

        return array_merge(getenv(), [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'pgsql',
            'DB_URL' => '',
            'DB_HOST' => (string) $pgsql['host'],
            'DB_PORT' => (string) $pgsql['port'],
            'DB_DATABASE' => (string) $pgsql['database'],
            'DB_USERNAME' => (string) $pgsql['username'],
            'DB_PASSWORD' => (string) $pgsql['password'],
        ]);
    }
}
