<?php

use App\Support\DatabaseRoles;
use Database\Seeders\Parity\ParityGuard;
use Database\Seeders\Parity\Scenario;
use Illuminate\Support\Facades\DB;
use Tests\Support\ParityFacts;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 2.6 AC 2: the seed guard, the 0.4 rules (parity-seed-guard.mjs) adapted. Each refusal exits 1 with its
// own message and leaves the previously seeded scenario untouched.
pest()->use(TruncatesDatabaseAsOwner::class);

beforeEach(function () {
    config(['parity.mode' => true, 'parity.scenarios_dir' => '/var/www/parity-fixtures/scenarios']);
    ParityFacts::createMarker();
    $this->artisan('parity:seed', ['scenario' => 'two-tenants'])->assertExitCode(0);
    $this->seeded = ParityFacts::expected(Scenario::load('/var/www/parity-fixtures/scenarios', 'two-tenants'));
});

afterEach(function () {
    ParityFacts::dropMarker();
    DB::disconnect(DatabaseRoles::MIGRATE);
    DB::disconnect(DatabaseRoles::RUNTIME);
});

it('refuses when :dataset', function (Closure $break, string $message) {
    $original = ['app.env' => config('app.env'), 'database.connections.pgsql_migrate' => config('database.connections.pgsql_migrate')];
    $break();

    $this->artisan('parity:seed', ['scenario' => 'admin-only'])->expectsOutputToContain($message)->assertExitCode(1);
    config($original); // the facts are read back through the real connection
    ParityFacts::createMarker();
    expect(ParityFacts::actual())->toBe($this->seeded);
})->with([
    'PARITY_MODE is not 1' => [fn () => config(['parity.mode' => false]), 'parity seed refused: PARITY_MODE=1 is required'],
    'APP_ENV is production' => [fn () => config(['app.env' => 'production']), 'parity seed refused: APP_ENV=production'],
    'the migrate host is not local' => [
        fn () => config(['database.connections.pgsql_migrate.host' => 'db.example.com']),
        'parity seed refused: host db.example.com of the pgsql_migrate connection is not a local parity host',
    ],
    'the migrate URL names a remote host' => [
        fn () => config(['database.connections.pgsql_migrate.url' => 'postgresql://portal_migrate:x@db.example.com:5432/portal']),
        'parity seed refused: host db.example.com of the pgsql_migrate connection is not a local parity host',
    ],
    'the parity marker is missing' => [fn () => ParityFacts::dropMarker(), 'parity seed refused: table parity.parity_marker is missing'],
]);

it('accepts each local host Next accepts', function (string $host) {
    config(['database.connections.pgsql_migrate.host' => $host]);

    // assertTarget only reads config: nothing connects to the host.
    expect(fn () => app(ParityGuard::class)->assertTarget())->not->toThrow(Throwable::class);
})->with(['127.0.0.1', 'localhost', 'postgres', '::1', '[::1]']);

it('checks the rules in order: mode, environment, host, then the marker', function () {
    config(['parity.mode' => false, 'app.env' => 'production', 'database.connections.pgsql_migrate.host' => 'db.example.com']);
    ParityFacts::dropMarker();
    $seed = fn () => $this->artisan('parity:seed', ['scenario' => 'admin-only']);

    $seed()->expectsOutputToContain('PARITY_MODE=1 is required')->assertExitCode(1);
    config(['parity.mode' => true]);
    $seed()->expectsOutputToContain('APP_ENV=production')->assertExitCode(1);
    config(['app.env' => 'testing']);
    $seed()->expectsOutputToContain('host db.example.com')->assertExitCode(1);
    config(['database.connections.pgsql_migrate.host' => 'postgres']);
    $seed()->expectsOutputToContain('parity.parity_marker is missing')->assertExitCode(1);
});

it('refuses before reading the scenario file: no mode, an unknown scenario → the mode message', function () {
    config(['parity.mode' => false]);

    $this->artisan('parity:seed', ['scenario' => 'no-such-scenario'])
        ->expectsOutputToContain('PARITY_MODE=1 is required')
        ->doesntExpectOutputToContain('unknown scenario')
        ->assertExitCode(1);
});
