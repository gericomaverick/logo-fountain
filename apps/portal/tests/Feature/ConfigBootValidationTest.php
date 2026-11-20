<?php

use App\Providers\ConfigValidationServiceProvider;
use App\Support\AuthProxyConfig;
use App\Support\InvalidConfiguration;
use Illuminate\Support\Facades\Process;

// Story 1.3 AC 2 (ADR-013, FR57), O-05 preflight and the architecture §5 env rule.

function bootValidation(): void
{
    (new ConfigValidationServiceProvider(app()))->boot();
}

it('fails boot in production when the runtime and migrate users are equal', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['database.connections.pgsql_migrate.username' => config('database.connections.pgsql.username')]);

    bootValidation();
})->throws(InvalidConfiguration::class, 'pgsql and pgsql_migrate require distinct runtime and migration roles');

it('fails boot in production when the two connections reach different databases', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['database.connections.pgsql_migrate.database' => 'elsewhere']);

    bootValidation();
})->throws(InvalidConfiguration::class, 'must target the same explicit host, port and database');

it('boots in production with the compose role pair', function () {
    app()->detectEnvironment(fn () => 'production');

    bootValidation();
    expect(true)->toBeTrue();
});

it('does not check the role pair outside production', function () {
    config(['database.connections.pgsql_migrate.username' => config('database.connections.pgsql.username')]);

    bootValidation();
    expect(true)->toBeTrue();
});

it('refuses to boot a real production process with equal DB users, without printing the password', function () {
    $env = ['APP_ENV' => 'production', 'APP_DEBUG' => 'false', 'DB_MIGRATE_USERNAME' => 'portal_runtime', 'DB_MIGRATE_PASSWORD' => 'not-printed-secret'];

    $bad = Process::path(base_path())->env($env)->run(['php', 'artisan', 'about', '--only=environment']);
    expect($bad->failed())->toBeTrue()
        ->and($bad->output().$bad->errorOutput())->toContain('require distinct runtime and migration roles')
        ->not->toContain('not-printed-secret');

    $good = Process::path(base_path())->env(['APP_ENV' => 'production', 'APP_DEBUG' => 'false'])->run(['php', 'artisan', 'about', '--only=environment']);
    expect($good->successful())->toBeTrue();
});

it('passes the preflight outside production unless --production is given', function () {
    config(['portal.auth_client_ip_header' => null, 'portal.auth_trusted_proxy_hops' => null, 'portal.public_site_url' => null]);

    $this->artisan('proxy:preflight')->assertSuccessful();
    $this->artisan('proxy:preflight', ['--production' => true])
        ->expectsOutputToContain(AuthProxyConfig::PREFLIGHT_FAILURE)
        ->expectsOutputToContain('PUBLIC_SITE_URL preflight failed')
        ->assertFailed();
});

it('fails the production preflight on bad proxy config or an http PUBLIC_SITE_URL', function (array $config, string $message) {
    app()->detectEnvironment(fn () => 'production');
    config([
        'portal.public_site_url' => 'https://portal.logofountain.com',
        'portal.auth_client_ip_header' => 'cf-connecting-ip',
        'portal.auth_trusted_proxy_hops' => null,
        ...$config,
    ]);

    $this->artisan('proxy:preflight')->expectsOutputToContain($message)->assertFailed();
})->with([
    'no proxy' => [['portal.auth_client_ip_header' => null], AuthProxyConfig::PREFLIGHT_FAILURE],
    'both' => [['portal.auth_trusted_proxy_hops' => '1'], AuthProxyConfig::PREFLIGHT_FAILURE],
    'bad header' => [['portal.auth_client_ip_header' => 'cookie'], AuthProxyConfig::PREFLIGHT_FAILURE],
    'http site url' => [['portal.public_site_url' => 'http://portal.logofountain.com'], 'PUBLIC_SITE_URL preflight failed'],
    'no site url' => [['portal.public_site_url' => null], 'PUBLIC_SITE_URL preflight failed'],
]);

it('passes the production preflight with one valid proxy setting and an https PUBLIC_SITE_URL', function (array $proxy) {
    app()->detectEnvironment(fn () => 'production');
    config(['portal.public_site_url' => 'https://portal.logofountain.com', 'portal.auth_client_ip_header' => null, 'portal.auth_trusted_proxy_hops' => null, ...$proxy]);

    $this->artisan('proxy:preflight')->assertSuccessful();
})->with([
    [['portal.auth_client_ip_header' => 'cf-connecting-ip']],
    [['portal.auth_trusted_proxy_hops' => '2']],
]);

// `\.env(` (an escaped dot) only occurs inside regex strings, e.g. SecurityCheck's `import\.meta\.env(` pattern (1.1b).
it('reads env vars only in config/*.php', function () {
    $offenders = [];
    foreach (['app', 'bootstrap', 'database', 'routes', 'resources/views'] as $dir) {
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(base_path($dir), FilesystemIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file instanceof SplFileInfo && str_ends_with($file->getFilename(), '.php') && ! str_contains($file->getPathname(), '/bootstrap/cache/')
                && preg_match('/(?<![\w>$:])(?<!\\\\\.)(env|getenv)\s*\(|\$_ENV\b|\$_SERVER\s*\[\s*[\'"](?!REQUEST)/', (string) file_get_contents($file->getPathname())) === 1) {
                $offenders[] = $file->getPathname();
            }
        }
    }
    expect($offenders)->toBe([]);
});
