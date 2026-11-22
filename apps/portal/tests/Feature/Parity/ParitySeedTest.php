<?php

use App\Support\DatabaseRoles;
use Database\Seeders\Parity\ParitySeeder;
use Database\Seeders\Parity\Scenario;
use Database\Seeders\Parity\ScenarioId;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Tests\Support\ParityFacts;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 2.6 (O-02): php artisan parity:seed, the Laravel half of apps/web/scripts/parity-seed.mjs. The seeder
// commits on pgsql_migrate and psql reads the facts back, so: the truncation harness, not a transaction.
pest()->use(TruncatesDatabaseAsOwner::class);

const PARITY_SCENARIOS = '/var/www/parity-fixtures/scenarios';

beforeEach(function () {
    config(['parity.mode' => true, 'parity.scenarios_dir' => PARITY_SCENARIOS]);
    ParityFacts::createMarker();
});

afterEach(function () {
    ParityFacts::dropMarker();
    DB::disconnect(DatabaseRoles::MIGRATE);
    DB::disconnect(DatabaseRoles::RUNTIME);
});

function paritySeedFacts(string $name): array
{
    return ParityFacts::expected(Scenario::load(PARITY_SCENARIOS, $name));
}

// AC 3: from the directory listing, so a new fixture is picked up. No mount → one entry that fails, never a skip.
dataset('parity scenarios', function () {
    $names = array_map(fn (string $f): string => basename($f, '.json'), glob(PARITY_SCENARIOS.'/*.json') ?: []);

    return $names === [] ? ['no scenarios: mount tests/parity/fixtures/scenarios at '.PARITY_SCENARIOS] : $names;
});

it('seeds :dataset and the facts match the JSON (AC 3, 4)', function (string $name) {
    $this->artisan('parity:seed', ['scenario' => $name])->assertExitCode(0);

    expect(ParityFacts::actual())->toBe(paritySeedFacts($name));
})->with('parity scenarios');

it('reads every scenario in the mount (18 today)', function () {
    expect(glob(PARITY_SCENARIOS.'/*.json'))->toHaveCount(18);
});

it('seeds the same scenario twice in a row, and a second scenario replaces the first (AC 3)', function () {
    $this->artisan('parity:seed', ['scenario' => 'delivered'])->assertExitCode(0);
    $this->artisan('parity:seed', ['scenario' => 'delivered'])->assertExitCode(0);
    expect(ParityFacts::actual())->toBe(paritySeedFacts('delivered'));

    $this->artisan('parity:seed', ['scenario' => 'admin-only'])->assertExitCode(0);
    expect(ParityFacts::actual())->toBe(paritySeedFacts('admin-only'));
});

it('sets the admin flag through the owner role, which the runtime role may not do (AC 7, 8)', function () {
    $this->artisan('parity:seed', ['scenario' => 'admin-only'])->assertExitCode(0);
    $admin = ScenarioId::for('admin-only', 'user', Scenario::load(PARITY_SCENARIOS, 'admin-only')->users[0]->key);

    $migrate = DB::connection(DatabaseRoles::MIGRATE);
    expect($migrate->table('profiles')->where('id', $admin)->value('is_admin'))->toBeTrue()
        ->and($migrate->table('auth_admin_bootstrap')->pluck('user_id', 'id')->all())->toBe([1 => $admin])
        ->and($migrate->table('users')->where('id', $admin)->value('password'))->toStartWith('$2y$');

    $user = ScenarioId::for('admin-only', 'user', 'runtime-attempt');
    $migrate->table('users')->insert(['id' => $user, 'name' => 'R', 'email' => 'runtime@example.test', 'created_at' => now(), 'updated_at' => now()]);
    expect(fn () => DB::connection(DatabaseRoles::RUNTIME)->table('profiles')->insert([
        'id' => $user, 'email' => 'runtime@example.test', 'is_admin' => true, 'created_at' => now(), 'updated_at' => now(),
    ]))->toThrow(QueryException::class, 'operator-owned admin flag');
});

it('maps password: null to a user with no credential, and emailVerified to email_verified_at (AC 7)', function () {
    $this->artisan('parity:seed', ['scenario' => 'fresh-purchase'])->assertExitCode(0);
    $scenario = Scenario::load(PARITY_SCENARIOS, 'fresh-purchase');

    foreach ($scenario->users as $u) {
        $row = DB::connection(DatabaseRoles::MIGRATE)->table('users')->where('id', ScenarioId::for('fresh-purchase', 'user', $u->key))->first();
        expect($row)->not->toBeNull()
            ->and($row->password === null)->toBe($u->password === null)
            ->and($row->email_verified_at !== null)->toBe($u->emailVerified);
    }
    expect(array_filter($scenario->users, fn ($u) => $u->password === null))->not->toBeEmpty();
});

it('refuses :dataset with exit 1 and writes nothing (AC 1)', function (string $name, string $message) {
    $this->artisan('parity:seed', ['scenario' => 'two-tenants'])->assertExitCode(0);

    $this->artisan('parity:seed', ['scenario' => $name])->expectsOutputToContain($message)->assertExitCode(1);
    expect(ParityFacts::actual())->toBe(paritySeedFacts('two-tenants'));
})->with([
    'a bad name' => ['Two_Tenants', 'is not a scenario name'],
    'a path' => ['../scenarios/two-tenants', 'is not a scenario name'],
    'an unknown name' => ['no-such-scenario', 'unknown scenario "no-such-scenario"'],
]);

it('refuses a malformed or unhandled scenario file with exit 1 and writes nothing (AC 1)', function (string $json, string $message) {
    $this->artisan('parity:seed', ['scenario' => 'two-tenants'])->assertExitCode(0);
    $dir = sys_get_temp_dir().'/parity-seed-test-'.getmypid();
    File::ensureDirectoryExists($dir);
    File::put("{$dir}/broken.json", $json);
    config(['parity.scenarios_dir' => $dir]);

    try {
        $this->artisan('parity:seed', ['scenario' => 'broken'])->expectsOutputToContain($message)->assertExitCode(1);
    } finally {
        File::deleteDirectory($dir);
    }
    expect(ParityFacts::actual())->toBe(paritySeedFacts('two-tenants'));
})->with([
    'malformed JSON' => ['{"name": "broken",', 'malformed JSON'],
    'an unknown key' => ['{"name": "broken", "users": [], "projects": [], "extra": 1}', 'unknown key "extra"'],
    'a member who is not a user' => [json_encode(['name' => 'broken', 'users' => [], 'projects' => [[
        'key' => 'p1', 'client' => ['name' => 'C', 'billingEmail' => null, 'members' => ['ghost']], 'package' => 'x', 'status' => 'PAID',
        'order' => ['status' => 'paid', 'totalCents' => 1, 'sessionId' => null, 'paymentIntentId' => null], 'entitlements' => (object) [],
    ]]]), 'no user with key "ghost"'],
]);

it('fails, naming the mount, when the scenario directory is missing (AC 10)', function () {
    config(['parity.scenarios_dir' => '/var/www/parity-fixtures/not-mounted']);

    $this->artisan('parity:seed', ['scenario' => 'two-tenants'])
        ->expectsOutputToContain('mount tests/parity/fixtures/scenarios there')
        ->assertExitCode(1);
});

it('truncates every app table and keeps only the framework ones (Open question 6)', function () {
    $tables = DB::connection(DatabaseRoles::MIGRATE)->table('information_schema.tables')
        ->where('table_schema', 'public')->where('table_type', 'BASE TABLE')->pluck('table_name')->all();
    $kept = ['migrations', 'cache', 'cache_locks', 'job_batches'];

    expect(array_values(array_diff($tables, ParitySeeder::TABLES, $kept)))->toBe([])
        ->and(array_values(array_diff(ParitySeeder::TABLES, $tables)))->toBe([]);
});
