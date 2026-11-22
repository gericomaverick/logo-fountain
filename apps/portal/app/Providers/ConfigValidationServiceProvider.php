<?php

namespace App\Providers;

use App\Support\Auth\SessionCookie;
use App\Support\DatabaseRoles;
use Illuminate\Support\ServiceProvider;

/**
 * Boot-time validators (architecture §5 Config, FR57). Production refuses to boot when the runtime
 * and migrate connections are not two roles on one database (ADR-013). PUBLIC_SITE_URL and the proxy
 * config fail closed per request instead (RequireCanonicalOrigin, EnsureAuthAvailable) and are
 * checked before a deploy goes live by `php artisan proxy:preflight`.
 */
class ConfigValidationServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        if (! $this->app->isProduction()) {
            return;
        }

        /** @var array<string, mixed> $connections */
        $connections = config('database.connections', []);
        DatabaseRoles::assertValid($connections);
        DatabaseRoles::assertLimitsUsesRuntime($connections);
        /** @var array<string, mixed> $session */
        $session = config('session', []);
        SessionCookie::assertProductionValid($session);
    }
}
