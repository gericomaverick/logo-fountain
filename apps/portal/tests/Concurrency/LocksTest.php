<?php

use App\Support\DatabaseRoles;
use App\Support\Locks;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\PortalRows;
use Tests\Support\RaceChildren;

// Story 2.4 AC 6 (X-09): the three advisory locks, with Next's key strings. "other" is a second runtime connection
// that probes with pg_try_advisory_xact_lock on the key string Next uses, so a key mismatch fails the test.

const LOCKS_OTHER = 'pgsql_locks_other';

/** Can another session take the lock for this Next key string right now? */
function lockFreeFor(string $key): bool
{
    return DB::connection(LOCKS_OTHER)->transaction(
        fn ($db) => (bool) $db->scalar('SELECT pg_try_advisory_xact_lock(hashtextextended(?, 0))', [$key])
    );
}

beforeEach(function () {
    config(['database.connections.'.LOCKS_OTHER => config('database.connections.'.DatabaseRoles::RUNTIME)]);
});

afterEach(function () {
    DB::purge(LOCKS_OTHER);
});

dataset('locks', [
    'credential (auth:<id>)' => [fn () => Locks::credential('7d3c1d1e-0000-4000-8000-000000000001'), 'auth:7d3c1d1e-0000-4000-8000-000000000001'],
    'provision (provision:<email>)' => [fn () => Locks::provision('buyer@example.test'), 'provision:buyer@example.test'],
    'conceptUpload (<projectId>:<requestKey>)' => [fn () => Locks::conceptUpload('5e9a0c2b-0000-4000-8000-000000000002', 'req-1'), '5e9a0c2b-0000-4000-8000-000000000002:req-1'],
]);

it('exposes exactly the three locks of architecture §5', function () {
    $methods = array_map(fn (ReflectionMethod $m) => $m->getName(), (new ReflectionClass(Locks::class))->getMethods(ReflectionMethod::IS_PUBLIC));

    expect($methods)->toBe(['credential', 'provision', 'conceptUpload']);
})->group('pg-race');

it('holds the lock under Next\'s key until commit', function (Closure $take, string $key) {
    DB::beginTransaction();
    $take();
    expect(lockFreeFor($key))->toBeFalse()
        ->and(lockFreeFor($key.'-other'))->toBeTrue(); // a different key doesn't block
    DB::commit();

    expect(lockFreeFor($key))->toBeTrue();
})->with('locks')->group('pg-race');

it('releases the lock on rollback', function (Closure $take, string $key) {
    DB::beginTransaction();
    $take();
    expect(lockFreeFor($key))->toBeFalse();
    DB::rollBack();

    expect(lockFreeFor($key))->toBeTrue();
})->with('locks')->group('pg-race');

it('throws outside a transaction and takes nothing', function (Closure $take, string $key) {
    expect($take)->toThrow(LogicException::class, 'inside a transaction');
    expect(lockFreeFor($key))->toBeTrue();
})->with('locks')->group('pg-race');

it('makes a second holder of the same key wait until the first commits', function () {
    $other = DB::connection(LOCKS_OTHER);
    DB::beginTransaction();
    Locks::provision('wait@example.test');

    $other->beginTransaction();
    $other->statement("SET LOCAL lock_timeout = '200ms'");
    try {
        $other->select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', ['provision:wait@example.test']);
        throw new RuntimeException('did not wait');
    } catch (QueryException $e) {
        expect($e->errorInfo[0])->toBe('55P03'); // lock_not_available: it was waiting
    } finally {
        $other->rollBack();
        DB::commit();
    }
})->group('pg-race');

// Port of ledger #96 test 4 (Next postgres.integration.test.ts:52), the lock half: 8 concurrent
// check-then-insert receipt writers under Locks::conceptUpload converge on one row. Receipt lookups are 7.5a.
it('converges advisory-locked receipts written by concurrent retries (8 processes)', function () {
    $rows = new PortalRows(DatabaseRoles::MIGRATE);
    $projectId = $rows->project($rows->client());
    $actorId = $rows->profile();
    $requestKey = (string) Str::uuid();
    $publication = ['concept' => ['id' => (string) Str::uuid(), 'number' => 1, 'status' => 'published', 'notes' => null], 'projectStatus' => 'awaiting_feedback'];

    $children = RaceChildren::run('receipt', 8, [$projectId, $requestKey, $actorId, json_encode($publication)]);

    foreach ($children as $child) {
        expect($child['result'])->toEqual($publication); // jsonb reorders keys
    }
    expect(array_count_values(array_map(fn ($c) => $c['replayed'] ? 'replayed' : 'wrote', $children)))->toEqual(['wrote' => 1, 'replayed' => 7])
        ->and(DB::connection(DatabaseRoles::MIGRATE)->table('audit_events')->where('project_id', $projectId)->where('type', 'concept_upload_request')->count())->toBe(1);
})->group('pg-race');
