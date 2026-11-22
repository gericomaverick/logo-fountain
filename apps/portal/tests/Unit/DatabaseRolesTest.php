<?php

use App\Support\DatabaseRoles;
use App\Support\InvalidConfiguration;

// ADR-013: port of apps/web/src/lib/database-target.test.ts onto Laravel connection arrays.
// Next takes DATABASE_URL/DIRECT_URL; Laravel takes DB_URL/DB_MIGRATE_URL or the DB_* keys.

const RUNTIME_URL = 'postgresql://lf_runtime:runtime-secret@127.0.0.1:5432/lf_app?schema=public';
const MIGRATE_URL = 'postgresql://lf_migration:migration-secret@127.0.0.1/lf_app';

/** @return array<string, mixed> */
function viaUrl(?string $url): array
{
    return ['driver' => 'pgsql', 'url' => $url, 'search_path' => 'public'];
}

/** @return array<string, mixed> */
function viaKeys(string $username, string $password, string $host = 'postgres', int|string $port = '5432', string $database = 'portal'): array
{
    return ['driver' => 'pgsql', 'url' => null, 'host' => $host, 'port' => $port, 'database' => $database,
        'username' => $username, 'password' => $password, 'search_path' => 'public'];
}

function check(mixed $runtime, mixed $migrate): void
{
    DatabaseRoles::assertValid(['pgsql' => $runtime, 'pgsql_migrate' => $migrate]);
}

it('accepts explicit same-target separate-role URLs and DB_* keys', function () {
    check(viaUrl(RUNTIME_URL), viaUrl(MIGRATE_URL));
    check(viaKeys('portal_runtime', 'a'), viaKeys('portal_migrate', 'b', port: 5432));
    expect(true)->toBeTrue();
});

it('rejects a missing, ambiguous, overridden or Supabase target', function (?string $value) {
    check(viaUrl($value), viaUrl(MIGRATE_URL));
})->throws(InvalidConfiguration::class, 'pgsql: expected an explicit non-Supabase PostgreSQL target')->with([
    null, '', 'https://user:pw@localhost/db', 'postgresql:///db', 'postgresql://user:pw@localhost',
    'postgresql://user@localhost/db', 'postgresql://user:pw@localhost/db#fragment', 'postgresql://user:pw@localhost/a/b',
    'postgresql://user:pw@localhost/db?schema=auth', 'postgresql://user:pw@localhost/db?schema=public&schema=auth',
    'postgresql://user:pw@localhost/db?host=live', 'postgresql://user:pw@localhost/db?hostaddr=1.2.3.4',
    'postgresql://user:pw@localhost/db?options=-c%20role=owner', 'postgresql://user:pw@localhost/db?user=owner',
    'postgresql://user:pw@localhost/db?service=live', 'postgresql://user:pw@db.project.supabase.co/db',
    'postgresql://user:pw@aws-0-eu.pooler.supabase.com/db', 'postgresql://user:pw@DB.SUPABASE.NET./db',
    'postgresql://user:pw@db.%73upabase.co/db',
    // Laravel-specific routing keys
    'postgresql://user:pw@localhost/db?username=owner', 'postgresql://user:pw@localhost/db?search_path=auth',
]);

it('rejects a migrate target on another host, port or database, the same role, or an old provider', function (string $value) {
    check(viaUrl(RUNTIME_URL), viaUrl($value));
})->throws(InvalidConfiguration::class)->with([
    'postgresql://lf_migration:secret@localhost/lf_app', 'postgresql://lf_migration:secret@127.0.0.1:5433/lf_app',
    'postgresql://lf_migration:secret@127.0.0.1/other', 'postgresql://lf_runtime:secret@127.0.0.1/lf_app',
    'postgresql://lf_migration:secret@old.supabase.co/lf_app',
]);

it('refuses equal runtime and migrate users with the distinct-roles message', function () {
    check(viaKeys('portal_runtime', 'a'), viaKeys('portal_runtime', 'b'));
})->throws(InvalidConfiguration::class, 'pgsql and pgsql_migrate require distinct runtime and migration roles');

it('refuses a non-public search path, an empty password or a missing connection', function (mixed $runtime) {
    check($runtime, viaKeys('portal_migrate', 'b'));
})->throws(InvalidConfiguration::class)->with([
    'search path' => [[...viaKeys('portal_runtime', 'a'), 'search_path' => 'auth']],
    'no password' => [viaKeys('portal_runtime', '')],
    'mysql' => [[...viaKeys('portal_runtime', 'a'), 'driver' => 'mysql']],
    'missing' => [null],
]);

it('does not fall back to runtime credentials or leak secrets', function () {
    foreach ([[viaUrl(RUNTIME_URL), null], [null, viaUrl(MIGRATE_URL)], [viaUrl(RUNTIME_URL), viaUrl('postgresql://lf_migration:super-secret@old.supabase.co/db')],
        [viaKeys('same', 'runtime-secret'), viaKeys('same', 'migration-secret')]] as [$runtime, $migrate]) {
        try {
            check($runtime, $migrate);
            throw new RuntimeException('unexpected success');
        } catch (InvalidConfiguration $e) {
            expect($e->getMessage())->not->toMatch('/runtime-secret|migration-secret|super-secret/');
        }
    }
});

it('normalises case, a trailing dot and the default port but does not infer hostname aliases', function () {
    check(viaUrl(str_replace('127.0.0.1:5432', 'DB.INTERNAL.', RUNTIME_URL)), viaUrl(str_replace('127.0.0.1', 'db.internal', MIGRATE_URL)));
    expect(true)->toBeTrue();
});

// Story 2.1 AC 6 (ADR-009/013): pgsql_limits is the runtime role on the runtime's own target.

function checkLimits(mixed $runtime, mixed $limits): void
{
    DatabaseRoles::assertLimitsUsesRuntime(['pgsql' => $runtime, 'pgsql_limits' => $limits]);
}

it('accepts pgsql_limits as the runtime role on the same target, by URL or by keys', function () {
    checkLimits(viaUrl(RUNTIME_URL), viaUrl(str_replace('127.0.0.1:5432', '127.0.0.1', RUNTIME_URL)));
    checkLimits(viaKeys('portal_runtime', 'a'), viaKeys('portal_runtime', 'a', port: 5432));
    expect(true)->toBeTrue();
});

it('refuses a pgsql_limits with another username, host, port or database, without leaking the password', function (array $limits) {
    try {
        checkLimits(viaKeys('portal_runtime', 'runtime-secret'), $limits);
        throw new RuntimeException('unexpected success');
    } catch (InvalidConfiguration $e) {
        expect($e->getMessage())->toBe('pgsql_limits must use the runtime role on the same host, port and database as pgsql (ADR-009)')
            ->not->toContain('secret');
    }
})->with([
    'username' => [viaKeys('portal_migrate', 'limits-secret')],
    'host' => [viaKeys('portal_runtime', 'limits-secret', host: 'other-host')],
    'port' => [viaKeys('portal_runtime', 'limits-secret', port: 5433)],
    'database' => [viaKeys('portal_runtime', 'limits-secret', database: 'other')],
]);

it('refuses a missing or invalid pgsql_limits connection', function (mixed $limits) {
    checkLimits(viaKeys('portal_runtime', 'a'), $limits);
})->throws(InvalidConfiguration::class, 'pgsql_limits: expected an explicit non-Supabase PostgreSQL target')->with([
    'missing' => [null],
    'supabase' => [viaUrl('postgresql://portal_runtime:a@db.project.supabase.co/portal')],
]);
