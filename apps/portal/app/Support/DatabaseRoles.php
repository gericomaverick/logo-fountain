<?php

namespace App\Support;

use Illuminate\Support\ConfigurationUrlParser;
use InvalidArgumentException;

/**
 * ADR-013: the runtime (`pgsql`) and migrate (`pgsql_migrate`) connections must reach the same
 * explicit host, port and database as two different roles. Port of `validatePostgresTarget` and
 * `validateDatabaseTargets` (`apps/web/src/lib/database-target.ts`), applied to Laravel's resolved
 * connection arrays (DB_URL / DB_MIGRATE_URL merged in as the framework does). Messages never
 * contain credentials.
 */
final class DatabaseRoles
{
    public const RUNTIME = 'pgsql';

    public const MIGRATE = 'pgsql_migrate';

    public const LIMITS = 'pgsql_limits';

    /** Query keys that would silently re-route a connection (`database-target.ts:4`, plus Laravel's names). */
    private const OVERRIDE_KEYS = [
        'host', 'hostaddr', 'port', 'user', 'username', 'password', 'dbname', 'database',
        'service', 'servicefile', 'options', 'sslpassword', 'search_path', 'driver', 'url',
    ];

    /**
     * @param  array<string, mixed>  $connections  `config('database.connections')`
     *
     * @throws InvalidConfiguration
     */
    public static function assertValid(array $connections): void
    {
        $runtime = self::target($connections[self::RUNTIME] ?? null, self::RUNTIME);
        $migrate = self::target($connections[self::MIGRATE] ?? null, self::MIGRATE);

        if ($runtime['host'] !== $migrate['host'] || $runtime['port'] !== $migrate['port'] || $runtime['database'] !== $migrate['database']) {
            throw new InvalidConfiguration(self::RUNTIME.' and '.self::MIGRATE.' must target the same explicit host, port and database; hostname aliases are not inferred');
        }
        if ($runtime['username'] === $migrate['username']) {
            throw new InvalidConfiguration(self::RUNTIME.' and '.self::MIGRATE.' require distinct runtime and migration roles');
        }
    }

    /**
     * ADR-009/013: the rate-limit connection is the runtime role on the runtime's own target (story 2.1).
     *
     * @param  array<string, mixed>  $connections  `config('database.connections')`
     *
     * @throws InvalidConfiguration
     */
    public static function assertLimitsUsesRuntime(array $connections): void
    {
        $runtime = self::target($connections[self::RUNTIME] ?? null, self::RUNTIME);
        $limits = self::target($connections[self::LIMITS] ?? null, self::LIMITS);

        if ($runtime !== $limits) {
            throw new InvalidConfiguration(self::LIMITS.' must use the runtime role on the same host, port and database as '.self::RUNTIME.' (ADR-009)');
        }
    }

    /**
     * @return array{host: string, port: string, database: string, username: string}
     *
     * @throws InvalidConfiguration
     */
    private static function target(mixed $config, string $label): array
    {
        $fail = new InvalidConfiguration($label.': expected an explicit non-Supabase PostgreSQL target with user, password, host and database; connection routing overrides are forbidden');
        if (! is_array($config)) {
            throw $fail;
        }
        $url = $config['url'] ?? null;
        if (is_string($url) && $url !== '') {
            if (self::hasOverrides($url)) {
                throw $fail;
            }
            try {
                /** @var array<string, mixed> $config */
                $config = (new ConfigurationUrlParser)->parseConfiguration($config);
            } catch (InvalidArgumentException) {
                throw $fail;
            }
        }

        $host = $config['host'] ?? null;
        $port = $config['port'] ?? null;
        $database = $config['database'] ?? null;
        $username = $config['username'] ?? null;
        $password = $config['password'] ?? null;
        if (($config['driver'] ?? null) !== 'pgsql' || ! is_string($host) || ! is_string($database) || ! is_string($username) || ! is_string($password)) {
            throw $fail;
        }
        $host = self::normaliseHost($host);
        $port = ($port === null || $port === '') ? '5432' : (is_int($port) || is_string($port) ? (string) $port : '');
        $searchPath = $config['search_path'] ?? 'public';

        if ($host === null || str_contains($host, 'supabase') || preg_match('/^[1-9][0-9]{0,4}$/D', $port) !== 1
            || $username === '' || $password === '' || preg_match('/^[A-Za-z0-9_][A-Za-z0-9_-]*$/D', $database) !== 1
            || $searchPath !== 'public') {
            throw $fail;
        }

        return ['host' => $host, 'port' => $port, 'database' => $database, 'username' => $username];
    }

    private static function normaliseHost(string $host): ?string
    {
        $host = strtolower(rawurldecode($host));
        if (str_ends_with($host, '.')) {
            $host = substr($host, 0, -1);
        }
        if ($host === '' || preg_match('/[\s\/,\\\\%]/', $host) === 1) {
            return null;
        }
        if (! str_starts_with($host, '[') && preg_match('/[^\x00-\x7f]/', $host) === 1) {
            $ascii = function_exists('idn_to_ascii') ? idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46) : false;

            return $ascii === false ? null : strtolower($ascii);
        }

        return $host;
    }

    private static function hasOverrides(string $url): bool
    {
        if (str_contains($url, '#')) {
            return true;
        }
        $query = parse_url($url, PHP_URL_QUERY);
        if (! is_string($query) || $query === '') {
            return false;
        }
        foreach (explode('&', $query) as $pair) {
            $key = strtolower(rawurldecode(explode('=', $pair, 2)[0]));
            $value = rawurldecode(explode('=', $pair, 2)[1] ?? '');
            if (in_array($key, self::OVERRIDE_KEYS, true) || ($key === 'schema' && $value !== 'public')) {
                return true;
            }
        }

        return false;
    }
}
