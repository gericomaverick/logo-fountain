<?php

use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;

// Story 2.1 (ADR-012/013): the migrations run, re-run and roll back as the schema owner. Leaves the database
// freshly migrated and granted for the tests after it.

function publicTables(): array
{
    return array_map(fn ($r) => $r->relname, DB::connection(DatabaseRoles::MIGRATE)->select("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r' order by relname"));
}

it('runs migrate:fresh twice in a row, rolls everything back and migrates again as the migrate role', function () {
    $this->artisan('migrate:fresh', ['--database' => DatabaseRoles::MIGRATE])->assertSuccessful();
    $this->artisan('migrate:fresh', ['--database' => DatabaseRoles::MIGRATE])->assertSuccessful();
    $tables = publicTables();

    $this->artisan('migrate:rollback', ['--database' => DatabaseRoles::MIGRATE])->assertSuccessful();
    $this->artisan('migrate:reset', ['--database' => DatabaseRoles::MIGRATE])->assertSuccessful();
    expect(publicTables())->toBe(['migrations'])
        ->and(DB::connection(DatabaseRoles::MIGRATE)->scalar("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'"))->toBe(0);

    $this->artisan('migrate', ['--database' => DatabaseRoles::MIGRATE])->assertSuccessful();
    $this->artisan('db:grants')->assertSuccessful();
    expect(publicTables())->toBe($tables)->toHaveCount(28);
});

it('leaves every table and sequence owned by the migrate role', function () {
    $owners = DB::connection(DatabaseRoles::MIGRATE)->select("select distinct pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind in ('r', 'S', 'i')");

    expect(array_map(fn ($r) => $r->owner, $owners))->toBe([config('database.connections.pgsql_migrate.username')]);
});
