<?php

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

// ADR-013: the runtime role (default `pgsql` connection) can't change the schema; the migrate role owns it.

it('connects as two distinct roles', function () {
    $runtime = DB::connection('pgsql')->scalar('select current_user');
    $migrate = DB::connection('pgsql_migrate')->scalar('select current_user');

    expect($runtime)->not->toBe($migrate);
});

it('refuses DDL from the runtime role', function () {
    DB::connection('pgsql')->statement('create table story_1_1a_probe (id int)');
})->throws(QueryException::class, 'permission denied');

it('lets the migrate role create a table the runtime role can then use', function () {
    $migrate = DB::connection('pgsql_migrate');
    $migrate->statement('create table if not exists story_1_1a_probe (id int)');

    try {
        DB::connection('pgsql')->table('story_1_1a_probe')->insert(['id' => 1]);
        expect(DB::connection('pgsql')->table('story_1_1a_probe')->count())->toBe(1);
    } finally {
        $migrate->statement('drop table story_1_1a_probe');
    }
});
