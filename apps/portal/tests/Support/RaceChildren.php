<?php

namespace Tests\Support;

use Illuminate\Process\Pool;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Story 2.4: runs tests/Concurrency/Children/race.php in parallel processes (each with its own PG connection),
 * released together at a shared start time, and returns each child's decoded JSON line.
 */
final class RaceChildren
{
    /**
     * @param  list<string>  $args
     * @return list<array<string, mixed>>
     */
    public static function run(string $mode, int $count, array $args): array
    {
        $startAt = sprintf('%.3F', microtime(true) + 2.5);
        $env = ['APP_ENV' => 'testing', 'DB_CONNECTION' => 'pgsql', 'DB_DATABASE' => (string) config('database.connections.pgsql.database'), 'DB_URL' => '',
            'CACHE_STORE' => 'array', 'QUEUE_CONNECTION' => 'sync', 'SESSION_DRIVER' => 'array', 'MAIL_MAILER' => 'array'];

        $results = Process::pool(function (Pool $pool) use ($mode, $count, $args, $startAt, $env): void {
            for ($i = 0; $i < $count; $i++) {
                $pool->path(base_path())->env($env)->timeout(60)
                    ->command(['php', 'tests/Concurrency/Children/race.php', $mode, $startAt, ...$args]);
            }
        })->start()->wait();

        $out = [];
        foreach ($results as $result) {
            if (! $result->successful()) {
                throw new RuntimeException("race child failed ({$result->exitCode()}): ".$result->errorOutput().$result->output());
            }
            $decoded = json_decode(trim($result->output()), true);
            if (! is_array($decoded)) {
                throw new RuntimeException('race child printed no JSON: '.$result->output());
            }
            $out[] = $decoded;
        }

        return $out;
    }
}
