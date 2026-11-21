<?php

use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;

// Story 2.1 AC 1, 2 (X-15, A-19, ADR-012). Read through the owner: information_schema hides from the
// runtime role whatever it has no privilege on (migrations, auth_admin_bootstrap).

/** @return array<string, mixed> */
function expectedSchema(): array
{
    return require base_path('tests/Fixtures/schema/expected.php');
}

/** @return list<object> */
function catalog(string $sql): array
{
    return array_values(DB::connection(DatabaseRoles::MIGRATE)->select($sql));
}

/** @return array<string, array<string, mixed>> */
function actualPortalTables(): array
{
    $framework = expectedSchema()['framework'];
    $tables = [];
    foreach (catalog("select c.relname as tbl, a.attname as col, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as notnull, pg_get_expr(d.adbin, d.adrelid) as def
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped order by c.relname, a.attnum") as $r) {
        if (in_array($r->tbl, $framework, true)) {
            continue;
        }
        $tables[$r->tbl]['columns'][$r->col] = $r->type.($r->notnull ? ' not null' : '').($r->def !== null ? ' default '.$r->def : '');
        $tables[$r->tbl]['indexes'] ??= [];
        $tables[$r->tbl]['foreign'] ??= [];
    }
    foreach (catalog("select t.relname as tbl, i.indisprimary as is_primary, i.indisunique as is_unique,
          case when i.indexprs is null then (select string_agg(a.attname, ',' order by k.ord) from unnest(i.indkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) else pg_get_expr(i.indexprs, i.indrelid) end as cols
        from pg_index i join pg_class t on t.oid = i.indrelid join pg_namespace n on n.oid = t.relnamespace where n.nspname = 'public'") as $r) {
        if (isset($tables[$r->tbl])) {
            $tables[$r->tbl]['indexes'][] = ($r->is_primary ? 'primary' : ($r->is_unique ? 'unique' : 'index'))." ({$r->cols})";
        }
    }
    $actions = ['a' => 'no action', 'r' => 'restrict', 'c' => 'cascade', 'n' => 'set null', 'd' => 'set default'];
    foreach (catalog("select t.relname as tbl, a.attname as col, rt.relname as ref, ra.attname as refcol, c.confdeltype as del
        from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_class rt on rt.oid = c.confrelid
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1] join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
        join pg_namespace n on n.oid = t.relnamespace where n.nspname = 'public' and c.contype = 'f'") as $r) {
        $tables[$r->tbl]['foreign'][] = "{$r->col} -> {$r->ref}({$r->refcol}) on delete ".$actions[$r->del];
    }
    foreach (catalog("select t.relname as tbl, c.conname as name, pg_get_constraintdef(c.oid) as def from pg_constraint c
        join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace where n.nspname = 'public' and c.contype = 'c'") as $r) {
        $tables[$r->tbl]['checks'][$r->name] = $r->def;
    }

    return $tables;
}

/** @param  array<string, array<string, mixed>>  $tables
 * @return array<string, array<string, mixed>> */
function sortLists(array $tables): array
{
    foreach ($tables as $name => $table) {
        foreach (['indexes', 'foreign'] as $key) {
            $list = $table[$key] ?? [];
            sort($list);
            $tables[$name][$key] = $list;
        }
    }
    ksort($tables);

    return $tables;
}

it('has exactly the portal tables plus the kept framework tables', function () {
    $actual = array_map(fn ($r) => $r->relname, catalog("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r' order by relname"));
    $expected = [...expectedSchema()['framework'], ...array_keys(expectedSchema()['tables'])];
    sort($expected);

    expect($actual)->toBe($expected)->and(expectedSchema()['tables'])->toHaveCount(22);
});

it('matches the checklist column for column, index for index and FK for FK', function () {
    expect(sortLists(actualPortalTables()))->toEqual(sortLists(expectedSchema()['tables']));
});

it('ports 29 FKs plus sessions.user_id, none with an ON UPDATE action', function () {
    $fks = catalog("select c.confdeltype as del, c.confupdtype as upd from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype = 'f'");
    $byAction = array_count_values(array_map(fn ($r) => $r->del, $fks));
    ksort($byAction);

    expect($fks)->toHaveCount(30)
        ->and($byAction)->toBe(['c' => 21, 'n' => 2, 'r' => 7])
        ->and(array_unique(array_map(fn ($r) => $r->upd, $fks)))->toBe(['a']);
});

it('keys every portal table by uuid except the listed exceptions', function () {
    $keys = [];
    foreach (catalog("select t.relname as tbl, string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ',') as cols
        from pg_index i join pg_class t on t.oid = i.indrelid join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        join pg_namespace n on n.oid = t.relnamespace where n.nspname = 'public' and i.indisprimary group by t.relname") as $r) {
        if (! in_array($r->tbl, expectedSchema()['framework'], true) && ! str_ends_with($r->cols, ' uuid')) {
            $keys[$r->tbl] = $r->cols;
        }
    }
    ksort($keys);

    expect($keys)->toBe(expectedSchema()['non_uuid_keys']);
});

it('has the admin-flag trigger function (search_path pinned) and one BEFORE INSERT OR UPDATE row trigger on profiles', function () {
    $triggers = catalog("select pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal");
    $functions = catalog("select p.proname, array_to_string(p.proconfig, ';') as config from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'");

    // Hardened vs Next (story 2.1 review): a temporary pg_class can't shadow the catalog inside the trigger.
    expect(array_map(fn ($r) => $r->def, $triggers))->toBe([expectedSchema()['trigger']])
        ->and(array_map(fn ($r) => [$r->proname, $r->config], $functions))->toBe([['protect_operator_admin_flag', 'search_path=pg_catalog, pg_temp']]);
});
