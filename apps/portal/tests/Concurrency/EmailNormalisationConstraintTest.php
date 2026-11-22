<?php

use App\Support\DatabaseRoles;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\PortalRows;

// Story 2.1 AC 4 (A-19): users.email and profiles.email must equal lower(btrim(email)), from either role.

function insertEmail(string $connection, string $table, string $email): void
{
    $id = $table === 'profiles' ? (new PortalRows(DatabaseRoles::MIGRATE))->user() : (string) Str::uuid();
    $row = $table === 'users' ? ['id' => $id, 'name' => 'Email test', 'email' => $email] : ['id' => $id, 'email' => $email];
    DB::connection($connection)->table($table)->insert($row);
}

dataset('email roles', [DatabaseRoles::RUNTIME, DatabaseRoles::MIGRATE]);
dataset('email tables', ['users' => ['users', 'users_normalized_email'], 'profiles' => ['profiles', 'profiles_normalized_email']]);

it('rejects an email that is not lower-cased and trimmed', function (string $connection, string $table, string $constraint, string $email) {
    try {
        insertEmail($connection, $table, $email);
    } catch (QueryException $e) {
        expect($e->getCode())->toBe('23514')->and($e->getMessage())->toContain($constraint);

        return;
    }
    throw new RuntimeException('un-normalised email accepted');
})->with('email roles')->with('email tables')->with(['upper case' => 'A@x.com', 'leading space' => ' a@x.com', 'trailing space' => 'a@x.com '])->group('pg-race');

it('accepts a normalised email, and a trailing tab (btrim strips spaces only, as Next)', function (string $connection, string $table) {
    insertEmail($connection, $table, 'a@x.com');
    insertEmail($connection, $table, "a@x.com\t");

    expect(DB::connection(DatabaseRoles::MIGRATE)->table($table)->whereIn('email', ['a@x.com', "a@x.com\t"])->count())->toBe(2);
})->with('email roles')->with('email tables')->group('pg-race');
