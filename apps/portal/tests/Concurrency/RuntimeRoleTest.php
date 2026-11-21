<?php

use App\Support\DatabaseRoles;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// Story 2.1 AC 2, 5, 6 (O-06, X-15, ADR-009/013). Port of apps/web postgres.integration.test.ts:30-45 and
// auth.postgres.integration.test.ts:222-223 (ledger #96 tests 1-2, #66 runtime half).

const OPERATOR_TABLES = ['migrations', 'auth_admin_bootstrap'];

function expectPermissionDenied(callable $statement): void
{
    try {
        $statement();
    } catch (QueryException $e) {
        expect($e->getCode())->toBe('42501');

        return;
    }
    throw new RuntimeException('statement was not refused');
}

dataset('runtime connections', [DatabaseRoles::RUNTIME, DatabaseRoles::LIMITS]);

it('is a non-owner, non-superuser role that cannot create tables, temporary tables, roles or databases', function (string $connection) {
    $db = DB::connection($connection);
    $role = (array) $db->selectOne('select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit from pg_roles where rolname = current_user');
    // No TEMP: a temporary table could otherwise shadow catalog relations for unqualified names (story 2.1 review).
    $privileges = (array) $db->selectOne("select has_schema_privilege(current_user, 'public', 'CREATE') as create_schema,
        has_database_privilege(current_user, current_database(), 'CREATE') as create_db,
        has_database_privilege(current_user, current_database(), 'TEMP') as temp_db,
        (select pg_get_userbyid(datdba) from pg_database where datname = current_database()) = current_user as owns_db,
        exists(select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and pg_get_userbyid(c.relowner) = current_user) as owns");

    expect(array_values($role))->toBe([false, false, false, false, false])
        ->and($privileges)->toBe(['create_schema' => false, 'create_db' => false, 'temp_db' => false, 'owns_db' => false, 'owns' => false]);
    expectPermissionDenied(fn () => $db->statement('create temporary table forbidden (id int)'));
    expectPermissionDenied(fn () => $db->statement('create table public.forbidden (id int)'));
    expectPermissionDenied(fn () => $db->statement('create role forbidden'));
})->with('runtime connections')->group('pg-race');

it('has no access to migrations or operator bootstrap state', function (string $connection) {
    $db = DB::connection($connection);

    expectPermissionDenied(fn () => $db->table('migrations')->count());
    expectPermissionDenied(fn () => $db->table('migrations')->insert(['migration' => 'forged', 'batch' => 99]));
    expectPermissionDenied(fn () => $db->scalar("select nextval('migrations_id_seq')"));
    expectPermissionDenied(fn () => $db->table('auth_admin_bootstrap')->count());
    expectPermissionDenied(fn () => $db->table('auth_admin_bootstrap')->insert(['id' => 1, 'user_id' => (string) Str::uuid()]));
})->with('runtime connections')->group('pg-race');

it('has exactly SELECT, INSERT, UPDATE, DELETE on every other table and can draw from framework sequences', function (string $connection) {
    $db = DB::connection($connection);
    $tables = array_map(fn ($r) => $r->relname, $db->select("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r' order by relname"));
    $wrong = [];
    foreach (array_diff($tables, OPERATOR_TABLES) as $table) {
        $p = $db->selectOne("select has_table_privilege(current_user, ?, 'SELECT, INSERT, UPDATE, DELETE') and not has_table_privilege(current_user, ?, 'TRUNCATE')
            and not has_table_privilege(current_user, ?, 'REFERENCES') and not has_table_privilege(current_user, ?, 'TRIGGER') as ok", [$table, $table, $table, $table]);
        if (! $p->ok) {
            $wrong[] = $table;
        }
    }

    expect($tables)->toHaveCount(28)->and($wrong)->toBe([])
        ->and($db->scalar("select nextval('jobs_id_seq')"))->toBeInt()
        ->and($db->scalar("select nextval('failed_jobs_id_seq')"))->toBeInt();
})->with('runtime connections')->group('pg-race');

it('enables row-level security on no table', function () {
    $rls = DB::select("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r' and (relrowsecurity or relforcerowsecurity)");

    expect($rls)->toBe([]);
})->group('pg-race');

it('connects pgsql and pgsql_limits as one runtime role, and pgsql_migrate as another on the same database', function () {
    $who = fn (string $c) => (array) DB::connection($c)->selectOne('select current_user as role, current_database() as db, inet_server_port() as port');
    $runtime = $who(DatabaseRoles::RUNTIME);
    $migrate = $who(DatabaseRoles::MIGRATE);

    expect($who(DatabaseRoles::LIMITS))->toBe($runtime)
        ->and($migrate['role'])->not->toBe($runtime['role'])
        ->and([$migrate['db'], $migrate['port']])->toBe([$runtime['db'], $runtime['port']]);
})->group('pg-race');
