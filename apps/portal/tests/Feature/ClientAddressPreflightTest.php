<?php

use App\Support\AuthProxyConfig;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Support\Facades\Process;

// Story 1.5: Next client-address.test.ts #6, on a real `php artisan proxy:preflight` process (as Next
// spawns scripts/auth-proxy-preflight.mjs). Real env vars win over .env, so '' clears a dev value.
// Laravel's preflight also checks PUBLIC_SITE_URL (story 1.3), so every case sets an https one.

function preflight(string $env, array $config = [], bool $forceProduction = false): ProcessResult
{
    return Process::path(base_path())
        ->env(['APP_ENV' => $env, 'APP_DEBUG' => 'false', 'PUBLIC_SITE_URL' => 'https://portal.logofountain.com', 'AUTH_CLIENT_IP_HEADER' => '', 'AUTH_TRUSTED_PROXY_HOPS' => '', ...$config])
        ->run(['php', 'artisan', 'proxy:preflight', ...($forceProduction ? ['--production'] : [])]);
}

it('npm-start preflight rejects missing, both and invalid production config; development needs none', function () {
    foreach ([[], ['AUTH_CLIENT_IP_HEADER' => 'x-real-ip', 'AUTH_TRUSTED_PROXY_HOPS' => '1'], ['AUTH_TRUSTED_PROXY_HOPS' => 'nope'], ['AUTH_CLIENT_IP_HEADER' => 'host']] as $config) {
        $result = preflight('production', $config);
        expect($result->exitCode())->toBe(1)
            ->and($result->output().$result->errorOutput())->toContain(AuthProxyConfig::PREFLIGHT_FAILURE);
    }
    expect(preflight('production', ['AUTH_TRUSTED_PROXY_HOPS' => '2'])->exitCode())->toBe(0)
        ->and(preflight('production', ['AUTH_CLIENT_IP_HEADER' => 'X-Real-IP'])->exitCode())->toBe(0)
        ->and(preflight('local')->exitCode())->toBe(0)
        ->and(preflight('local', [], true)->exitCode())->toBe(1); // Next: npm start before NODE_ENV is set
});
