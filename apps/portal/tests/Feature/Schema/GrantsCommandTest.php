<?php

use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;

// Story 2.1 AC 5 (O-06, ADR-013): php artisan db:grants. Privileges are read through the owner, so the
// runtime connection (inside the test transaction) never takes a lock the owner would wait on.

function grantsSnapshot(): array
{
    $db = DB::connection(DatabaseRoles::MIGRATE);

    return [
        'relations' => $db->select("select c.relname, c.relacl::text as acl from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind in ('r', 'S') order by 1"),
        'defaults' => $db->select('select defaclobjtype, defaclacl::text as acl from pg_default_acl order by 1'),
        'schema' => $db->scalar("select nspacl::text from pg_namespace where nspname = 'public'"),
    ];
}

it('is a no-op when run twice', function () {
    $this->artisan('db:grants')->assertSuccessful();
    $before = grantsSnapshot();
    $this->artisan('db:grants')->assertSuccessful();

    expect(grantsSnapshot())->toEqual($before);
});

it('refuses any connection but the migrate role', function () {
    $this->artisan('db:grants', ['--database' => DatabaseRoles::RUNTIME])
        ->expectsOutputToContain('db:grants runs only on the pgsql_migrate connection')
        ->assertFailed();
});

it('gives the runtime DML, and only DML, on a table the migrate role creates later', function () {
    $migrate = DB::connection(DatabaseRoles::MIGRATE);
    $runtime = config('database.connections.pgsql.username');
    $migrate->statement('create table grants_probe (id bigserial primary key)');

    try {
        $privileges = $migrate->selectOne("select has_table_privilege(?, 'grants_probe', 'SELECT, INSERT, UPDATE, DELETE') as dml,
            has_table_privilege(?, 'grants_probe', 'TRUNCATE') as truncate, has_table_privilege(?, 'grants_probe', 'REFERENCES') as refs,
            has_sequence_privilege(?, 'grants_probe_id_seq', 'USAGE, SELECT') as seq", [$runtime, $runtime, $runtime, $runtime]);

        expect((array) $privileges)->toBe(['dml' => true, 'truncate' => false, 'refs' => false, 'seq' => true]);
    } finally {
        $migrate->statement('drop table grants_probe');
    }
});
