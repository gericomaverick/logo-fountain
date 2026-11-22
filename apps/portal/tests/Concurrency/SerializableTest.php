<?php

use App\Exceptions\ApiException;
use App\Support\Audit;
use App\Support\DatabaseRoles;
use App\Support\Db;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB as Database;
use Tests\Support\PortalRows;
use Tests\Support\RaceChildren;

// Story 2.4 AC 1-4 (ADR-011, X-17, NFR-R3): Db::serializable() retries 40001/40P01, never nests, and ends in the
// caller's 409. Rows are set up through pgsql_migrate (committed); "other" is a second runtime connection.

const SERIALIZABLE_OTHER = 'pgsql_other';

function serializableConflict(): ApiException
{
    return new ApiException('Project changed. Refresh and try again.', 409, 'LIFECYCLE_CONFLICT');
}

function serializableProject(): string
{
    $rows = new PortalRows(DatabaseRoles::MIGRATE);

    return $rows->project($rows->client());
}

function serializableVersion(string $projectId): int
{
    return (int) Database::connection(DatabaseRoles::MIGRATE)->table('projects')->where('id', $projectId)->value('version');
}

/** Raises a real database error with the given SQLSTATE. */
function raiseSqlState(Connection $db, string $state): void
{
    $db->statement("DO \$\$ BEGIN RAISE EXCEPTION 'forced %', '{$state}' USING ERRCODE = '{$state}'; END \$\$");
}

/** The other connection bumps the version in its own committed transaction. */
function otherWriterBumps(string $projectId): void
{
    Database::connection(SERIALIZABLE_OTHER)->transaction(fn (Connection $db) => $db->table('projects')->where('id', $projectId)->increment('version'));
}

beforeEach(function () {
    config(['database.connections.'.SERIALIZABLE_OTHER => config('database.connections.'.DatabaseRoles::RUNTIME)]);
});

afterEach(function () {
    Database::connection(SERIALIZABLE_OTHER)->rollBack(0);
    Database::purge(SERIALIZABLE_OTHER);
});

it('runs the callback in one SERIALIZABLE transaction with local timeouts and returns its result', function () {
    $seen = Db::serializable(fn (Connection $db) => [
        'isolation' => $db->selectOne('SHOW transaction_isolation')->transaction_isolation,
        'lock' => $db->selectOne('SHOW lock_timeout')->lock_timeout,
        'statement' => $db->selectOne('SHOW statement_timeout')->statement_timeout,
        'level' => $db->transactionLevel(),
    ], serializableConflict());

    expect($seen)->toBe(['isolation' => 'serializable', 'lock' => Db::LOCK_TIMEOUT, 'statement' => Db::STATEMENT_TIMEOUT, 'level' => 1])
        ->and(Database::transactionLevel())->toBe(0)
        ->and(Database::selectOne('SHOW lock_timeout')->lock_timeout)->toBe('0'); // SET LOCAL ended with the transaction
})->group('pg-race');

it('throws on nesting and starts nothing', function () {
    $ran = false;
    $mark = function () use (&$ran) {
        $ran = true;
    };
    Database::beginTransaction();
    try {
        expect(fn () => Db::serializable($mark, serializableConflict()))->toThrow(LogicException::class, 'must not nest');
        expect(Database::transactionLevel())->toBe(1);
    } finally {
        Database::rollBack();
    }

    expect(fn () => Db::serializable(fn () => Db::serializable($mark, serializableConflict()), serializableConflict()))
        ->toThrow(LogicException::class, 'must not nest');
    expect($ran)->toBeFalse()->and(Database::transactionLevel())->toBe(0);
})->group('pg-race');

it('retries a real serialization failure from a concurrent writer and keeps both writes', function () {
    $projectId = serializableProject();
    $attempts = 0;

    $version = Db::serializable(function (Connection $db) use ($projectId, &$attempts) {
        $attempts++;
        $row = $db->table('projects')->where('id', $projectId)->first(['status', 'version']);
        if ($attempts === 1) {
            otherWriterBumps($projectId); // commits between our read and our write
        }

        return Db::guardedProjectUpdate($projectId, $row->status, (int) $row->version, [], new ApiException('guard', 409, 'STATUS_CHANGE_CONFLICT'));
    }, serializableConflict());

    expect($attempts)->toBe(2)->and($version)->toBe(2)->and(serializableVersion($projectId))->toBe(2);
})->group('pg-race');

it('ends in the supplied 409 when the other writer always wins, with no partial write', function () {
    $projectId = serializableProject();
    $attempts = 0;
    $conflict = serializableConflict();

    try {
        Db::serializable(function (Connection $db) use ($projectId, &$attempts) {
            $attempts++;
            $row = $db->table('projects')->where('id', $projectId)->first(['status', 'version']);
            Audit::record('state_changed', $projectId, null, ['attempt' => $attempts]);
            otherWriterBumps($projectId);
            Db::guardedProjectUpdate($projectId, $row->status, (int) $row->version, [], new ApiException('guard', 409, 'STATUS_CHANGE_CONFLICT'));
        }, $conflict);
        throw new RuntimeException('no conflict');
    } catch (ApiException $e) {
        expect($e)->toBe($conflict)->and($e->status)->toBe(409)->and($e->errorCode)->toBe('LIFECYCLE_CONFLICT');
    }

    expect($attempts)->toBe(Db::MAX_ATTEMPTS)
        ->and(serializableVersion($projectId))->toBe(Db::MAX_ATTEMPTS) // only the other writer's bumps
        ->and(Database::connection(DatabaseRoles::MIGRATE)->table('audit_events')->count())->toBe(0);
})->group('pg-race');

it('retries a forced retryable error until it succeeds', function (string $state) {
    $attempts = 0;

    $result = Db::serializable(function (Connection $db) use ($state, &$attempts) {
        if (++$attempts < Db::MAX_ATTEMPTS) {
            raiseSqlState($db, $state);
        }

        return 'done';
    }, serializableConflict());

    expect($result)->toBe('done')->and($attempts)->toBe(Db::MAX_ATTEMPTS);
})->with(['serialization_failure' => '40001', 'deadlock_detected' => '40P01'])->group('pg-race');

it('throws the supplied conflict (or builds it) once retries run out', function (string $state) {
    $attempts = 0;
    $work = function (Connection $db) use ($state, &$attempts) {
        $attempts++;
        raiseSqlState($db, $state);
    };

    expect(fn () => Db::serializable($work, serializableConflict()))->toThrow(ApiException::class, 'Project changed');
    expect($attempts)->toBe(Db::MAX_ATTEMPTS);

    $attempts = 0;
    $built = new ApiException('Final publication conflict', 409, 'FINAL_PUBLICATION_CONFLICT', ['uploadedObjectRetained' => true]);
    try {
        Db::serializable($work, fn () => $built);
    } catch (ApiException $e) {
        expect($e)->toBe($built);
    }
    expect($attempts)->toBe(Db::MAX_ATTEMPTS);
})->with(['serialization_failure' => '40001', 'deadlock_detected' => '40P01'])->group('pg-race');

it('does not retry other database errors and lets them through unchanged', function (string $state) {
    $attempts = 0;
    try {
        Db::serializable(function (Connection $db) use ($state, &$attempts) {
            $attempts++;
            raiseSqlState($db, $state);
        }, serializableConflict());
        throw new RuntimeException('no error');
    } catch (QueryException $e) {
        expect(Db::sqlState($e))->toBe($state);
    }
    expect($attempts)->toBe(1)->and(Database::transactionLevel())->toBe(0);
})->with(['unique_violation' => '23505', 'foreign_key_violation' => '23503', 'check_violation' => '23514'])->group('pg-race');

it('does not retry a domain exception and lets it through unchanged', function () {
    $attempts = 0;
    $domain = new ApiException('Concept not found.', 404, 'CONCEPT_NOT_FOUND');
    try {
        Db::serializable(function () use ($domain, &$attempts) {
            $attempts++;
            throw $domain;
        }, serializableConflict());
    } catch (ApiException $e) {
        expect($e)->toBe($domain);
    }
    expect($attempts)->toBe(1);
})->group('pg-race');

it('maps a lock or statement timeout to the supplied conflict without retrying', function (string $setting, Closure $wait) {
    $projectId = serializableProject();
    $other = Database::connection(SERIALIZABLE_OTHER);
    $other->beginTransaction();
    $other->table('projects')->where('id', $projectId)->lockForUpdate()->first();
    $attempts = 0;

    $conflict = serializableConflict();
    try {
        Db::serializable(function (Connection $db) use ($setting, $wait, $projectId, &$attempts) {
            $attempts++;
            $db->statement("SET LOCAL {$setting} = '100ms'"); // shorter than the 5 s default, for the test
            $wait($db, $projectId);
        }, $conflict);
        throw new RuntimeException('no conflict');
    } catch (ApiException $e) {
        expect($e)->toBe($conflict);
    } finally {
        $other->rollBack();
    }
    expect($attempts)->toBe(1)->and(serializableVersion($projectId))->toBe(0);
})->with([
    'lock_timeout (55P03)' => ['lock_timeout', fn (Connection $db, string $id) => $db->table('projects')->where('id', $id)->increment('version')],
    'statement_timeout (57014)' => ['statement_timeout', fn (Connection $db) => $db->select('SELECT pg_sleep(2)')],
])->group('pg-race');

it('discards a failed attempt: no rows, no after-commit callback', function () {
    $projectId = serializableProject();
    $attempts = 0;
    $callbacks = [];

    Db::serializable(function (Connection $db) use ($projectId, &$attempts, &$callbacks) {
        $attempt = ++$attempts;
        Audit::record('state_changed', $projectId, null, ['attempt' => $attempt]);
        Database::afterCommit(function () use ($attempt, &$callbacks) {
            $callbacks[] = $attempt;
        });
        if ($attempt === 1) {
            raiseSqlState($db, '40001');
        }
    }, serializableConflict());

    $payloads = Database::connection(DatabaseRoles::MIGRATE)->table('audit_events')->pluck('payload')->all();
    expect($attempts)->toBe(2)->and($callbacks)->toBe([2])->and($payloads)->toBe(['{"attempt": 2}']);

    $callbacks = [];
    $attempts = 0;
    $failing = function (Connection $db) use (&$callbacks, &$attempts) {
        $attempts++;
        Database::afterCommit(function () use (&$callbacks) {
            $callbacks[] = 'ran';
        });
        raiseSqlState($db, '40001');
    };
    expect(fn () => Db::serializable($failing, serializableConflict()))->toThrow(ApiException::class);
    expect($attempts)->toBe(Db::MAX_ATTEMPTS)->and($callbacks)->toBe([])->and(Database::connection(DatabaseRoles::MIGRATE)->table('audit_events')->count())->toBe(1);
})->group('pg-race');

it('retries a serialization failure raised at COMMIT', function () {
    $owner = Database::connection(DatabaseRoles::MIGRATE);
    $owner->statement('CREATE TABLE serializable_commit_probe (id integer PRIMARY KEY)');
    $owner->statement("CREATE FUNCTION serializable_commit_probe_fail() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'forced at commit' USING ERRCODE = '40001'; END \$\$");
    $owner->statement('CREATE CONSTRAINT TRIGGER serializable_commit_probe_fail AFTER INSERT ON serializable_commit_probe DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION serializable_commit_probe_fail()');

    try {
        $attempts = 0;
        $callbacks = [];
        $result = Db::serializable(function (Connection $db) use (&$attempts, &$callbacks) {
            $attempt = ++$attempts;
            Database::afterCommit(function () use ($attempt, &$callbacks) {
                $callbacks[] = $attempt;
            });
            if ($attempt === 1) {
                $db->table('serializable_commit_probe')->insert(['id' => 1]); // fails only when COMMIT runs the trigger
            }

            return $attempt;
        }, serializableConflict());

        expect($result)->toBe(2)->and($attempts)->toBe(2)->and($callbacks)->toBe([2])
            ->and(Database::transactionLevel())->toBe(0)
            ->and($owner->table('serializable_commit_probe')->count())->toBe(0);
    } finally {
        $owner->statement('DROP TABLE serializable_commit_probe');
        $owner->statement('DROP FUNCTION serializable_commit_probe_fail()');
    }
})->group('pg-race');

it('keeps the version consistent under parallel serializable writers (4 processes)', function () {
    $projectId = serializableProject();
    $iterations = 10;

    $children = RaceChildren::run('increment', 4, [$projectId, (string) $iterations]);

    $ok = array_sum(array_column($children, 'ok'));
    $conflicts = array_merge_recursive(...array_column($children, 'conflicts'));
    $lifecycle = array_sum((array) ($conflicts['LIFECYCLE_CONFLICT'] ?? []));
    expect(array_keys($conflicts))->each->toBe('LIFECYCLE_CONFLICT') // never a guard miss: SERIALIZABLE catches it first
        ->and($ok + $lifecycle)->toBe(4 * $iterations)
        ->and($ok)->toBeGreaterThan(0)
        ->and(serializableVersion($projectId))->toBe($ok); // no lost update
    fwrite(STDERR, sprintf("  [race] serializable: %d ok, %d conflicts, %d attempts\n", $ok, $lifecycle, array_sum(array_column($children, 'attempts'))));
})->group('pg-race');
