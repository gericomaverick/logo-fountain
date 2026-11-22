<?php

use App\Exceptions\ApiException;
use App\Support\DatabaseRoles;
use App\Support\Db;
use Illuminate\Support\Facades\DB as Database;
use Tests\Support\PortalRows;
use Tests\Support\RaceChildren;

// Story 2.4 AC 5 (ADR-011, X-17): Db::guardedProjectUpdate() is the only thing that moves projects.version.

function guardConflict(): ApiException
{
    return new ApiException('Project status changed. Refresh and try again.', 409, 'STATUS_CHANGE_CONFLICT');
}

function guardedProject(): string
{
    $rows = new PortalRows(DatabaseRoles::MIGRATE);

    return $rows->project($rows->client());
}

/** @return array{status: string, version: int, updated_at: string} */
function guardedRow(string $projectId): array
{
    $row = Database::connection(DatabaseRoles::MIGRATE)->table('projects')->where('id', $projectId)->first(['status', 'version', 'updated_at']);

    return ['status' => $row->status, 'version' => (int) $row->version, 'updated_at' => (string) $row->updated_at];
}

afterEach(function () {
    // The truncation harness doesn't disconnect; without this each test holds its connections until GC.
    Database::disconnect(DatabaseRoles::RUNTIME);
    Database::disconnect(DatabaseRoles::MIGRATE);
});

it('advances the version by exactly one on a matching status and version', function () {
    $projectId = guardedProject();
    Database::connection(DatabaseRoles::MIGRATE)->table('projects')->where('id', $projectId)->update(['updated_at' => '2026-01-01 00:00:00']);

    expect(Db::guardedProjectUpdate($projectId, 'active', 0, ['status' => 'on_hold'], guardConflict()))->toBe(1);
    $row = guardedRow($projectId);
    expect($row['status'])->toBe('on_hold')->and($row['version'])->toBe(1)->and($row['updated_at'])->not->toStartWith('2026-01-01');

    expect(Db::guardedProjectUpdate($projectId, 'on_hold', 1, ['status' => 'active'], guardConflict()))->toBe(2)
        ->and(guardedRow($projectId)['version'])->toBe(2);
})->group('pg-race');

it('updates nothing and throws the caller conflict on a stale version, a changed status or an unknown project', function (string $case) {
    $projectId = guardedProject();
    $conflict = guardConflict();
    $before = guardedRow($projectId);

    try {
        match ($case) {
            'stale version' => Db::guardedProjectUpdate($projectId, 'active', 7, ['status' => 'on_hold'], $conflict),
            'changed status' => Db::guardedProjectUpdate($projectId, 'brief_submitted', 0, ['status' => 'on_hold'], $conflict),
            'unknown project' => Db::guardedProjectUpdate('00000000-0000-4000-8000-000000000000', 'active', 0, [], $conflict),
            'conflict built by a closure' => Db::guardedProjectUpdate($projectId, 'active', 3, [], fn () => $conflict),
        };
        throw new RuntimeException('no conflict');
    } catch (ApiException $e) {
        expect($e)->toBe($conflict);
    }
    expect(guardedRow($projectId))->toBe($before);
})->with(['stale version', 'changed status', 'unknown project', 'conflict built by a closure'])->group('pg-race');

it('refuses to set id or version itself', function (string $column) {
    $projectId = guardedProject();

    expect(fn () => Db::guardedProjectUpdate($projectId, 'active', 0, [$column => 5], guardConflict()))
        ->toThrow(InvalidArgumentException::class, "projects.{$column}");
    expect(guardedRow($projectId)['version'])->toBe(0);
})->with(['id', 'version'])->group('pg-race');

it('lets exactly one of several concurrent guarded updates win (6 processes)', function () {
    $projectId = guardedProject();

    $children = RaceChildren::run('guard', 6, [$projectId, '0']);

    expect(array_column($children, 'newVersion'))->toBe([1])
        ->and(array_count_values(array_column($children, 'conflict')))->toBe(['STATUS_CHANGE_CONFLICT' => 5]);
    expect(guardedRow($projectId))->toMatchArray(['status' => 'on_hold', 'version' => 1]);
})->group('pg-race');

it('leaves the version alone on any ordinary update (no trigger, no default bump)', function () {
    $projectId = guardedProject();

    Database::table('projects')->where('id', $projectId)->update(['status' => 'on_hold', 'package_code' => 'premium', 'updated_at' => now()]);
    Database::statement("UPDATE projects SET status = 'active' WHERE id = ?", [$projectId]);

    expect(guardedRow($projectId)['version'])->toBe(0)
        ->and(Database::connection(DatabaseRoles::MIGRATE)->scalar("SELECT count(*) FROM pg_trigger WHERE tgrelid = 'projects'::regclass AND NOT tgisinternal"))->toBe(0);
})->group('pg-race');
