<?php

namespace Tests\Support;

use App\Support\RateLimitKeys;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use stdClass;

/** Story 2.5: read and seed `auth_rate_limits` rows in tests, by logical key (through the schema owner). */
final class RateLimitBuckets
{
    /** Next's tests pass `now` as epoch milliseconds; so do these. */
    public static function at(int $epochMs): CarbonImmutable
    {
        return CarbonImmutable::createFromTimestampMs($epochMs, 'UTC');
    }

    /** @return array{hits: int, windowStart: string}|null */
    public static function row(string $logical): ?array
    {
        $row = DB::connection('pgsql_migrate')->table('auth_rate_limits')->where('key', RateLimitKeys::hash($logical))->first();
        if (! $row instanceof stdClass) {
            return null;
        }

        return ['hits' => (int) $row->hits, 'windowStart' => CarbonImmutable::parse($row->window_start, 'UTC')->format('Y-m-d H:i:s.v')];
    }

    public static function hits(string $logical): ?int
    {
        return self::row($logical)['hits'] ?? null;
    }

    public static function count(): int
    {
        return DB::connection('pgsql_migrate')->table('auth_rate_limits')->count();
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return DB::connection('pgsql_migrate')->table('auth_rate_limits')->orderBy('key')->pluck('key')->all();
    }

    public static function seed(string $logical, int $hits, CarbonImmutable $windowStart): void
    {
        DB::connection('pgsql_migrate')->table('auth_rate_limits')->insert([
            'key' => RateLimitKeys::hash($logical),
            'hits' => $hits,
            'window_start' => $windowStart->utc()->format('Y-m-d H:i:s.v'),
        ]);
    }
}
