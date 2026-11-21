<?php

use App\Support\DatabaseRoles;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\Support\PortalRows;

// Story 2.1 AC 3 (A-19, DV-14 mechanism): only the table owner can set or change profiles.is_admin.
// Setup through pgsql_migrate (committed); the runtime role is exercised on both runtime connections.

function owner(): PortalRows
{
    return new PortalRows(DatabaseRoles::MIGRATE);
}

function expectAdminFlagRefused(callable $statement): void
{
    try {
        $statement();
    } catch (QueryException $e) {
        expect($e->getCode())->toBe('P0001')->and($e->getMessage())->toContain('operator-owned admin flag');

        return;
    }
    throw new RuntimeException('the admin-flag trigger did not raise');
}

function isAdmin(string $id): bool
{
    return (bool) DB::connection(DatabaseRoles::MIGRATE)->table('profiles')->where('id', $id)->value('is_admin');
}

dataset('runtime connections', [DatabaseRoles::RUNTIME, DatabaseRoles::LIMITS]);

it('refuses a runtime insert of an admin', function (string $connection) {
    $id = owner()->user();

    expectAdminFlagRefused(fn () => DB::connection($connection)->table('profiles')->insert(['id' => $id, 'email' => "p-{$id}@example.test", 'is_admin' => true]));
    expect(DB::connection(DatabaseRoles::MIGRATE)->table('profiles')->where('id', $id)->exists())->toBeFalse();
})->with('runtime connections')->group('pg-race');

it('refuses a runtime promotion and a runtime demotion', function (string $connection) {
    $client = owner()->profile();
    $admin = owner()->profile(overrides: ['is_admin' => true]);

    expectAdminFlagRefused(fn () => DB::connection($connection)->table('profiles')->where('id', $client)->update(['is_admin' => true]));
    expectAdminFlagRefused(fn () => DB::connection($connection)->table('profiles')->where('id', $admin)->update(['is_admin' => false]));
    expect(isAdmin($client))->toBeFalse()->and(isAdmin($admin))->toBeTrue();
})->with('runtime connections')->group('pg-race');

it('refuses INSERT ... ON CONFLICT DO UPDATE with is_admin true even on an existing admin (F-17)', function (string $connection) {
    $admin = owner()->profile(overrides: ['is_admin' => true]);

    expectAdminFlagRefused(fn () => DB::connection($connection)->statement(
        'insert into profiles (id, email, is_admin) values (?, ?, true) on conflict (id) do update set is_admin = true',
        [$admin, "p-{$admin}@example.test"],
    ));
})->with('runtime connections')->group('pg-race');

it('lets the runtime insert non-admins and edit an admin row without changing the flag', function (string $connection) {
    $db = DB::connection($connection);
    $omitted = owner()->user();
    $false = owner()->user();
    $admin = owner()->profile(overrides: ['is_admin' => true]);

    $db->table('profiles')->insert(['id' => $omitted, 'email' => "p-{$omitted}@example.test"]);
    $db->table('profiles')->insert(['id' => $false, 'email' => "p-{$false}@example.test", 'is_admin' => false]);
    expect($db->table('profiles')->where('id', $admin)->update(['full_name' => 'Renamed Admin']))->toBe(1)
        ->and($db->table('profiles')->where('id', $admin)->update(['is_admin' => true]))->toBe(1);

    expect(isAdmin($omitted))->toBeFalse()->and(isAdmin($false))->toBeFalse()->and(isAdmin($admin))->toBeTrue()
        ->and(DB::connection(DatabaseRoles::MIGRATE)->table('profiles')->where('id', $admin)->value('full_name'))->toBe('Renamed Admin');
})->with('runtime connections')->group('pg-race');

it('lets the table owner insert an admin, promote and demote', function () {
    $db = DB::connection(DatabaseRoles::MIGRATE);
    $admin = owner()->profile(overrides: ['is_admin' => true]);
    $client = owner()->profile();

    $db->table('profiles')->where('id', $client)->update(['is_admin' => true]);
    $db->table('profiles')->where('id', $admin)->update(['is_admin' => false]);

    expect(isAdmin($admin))->toBeFalse()->and(isAdmin($client))->toBeTrue();
})->group('pg-race');
