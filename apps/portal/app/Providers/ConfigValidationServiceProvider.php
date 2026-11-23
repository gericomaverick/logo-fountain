<?php

namespace App\Providers;

use App\Support\Auth\SessionCookie;
use App\Support\DatabaseRoles;
use App\Support\InvalidConfiguration;
use App\Support\Stripe\StripeCatalog;
use Illuminate\Support\Facades\Log;
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
        // Price IDs (story 5.1 AC 8): Next only logs a placeholder (`lib/stripe.ts:19-27`); production here refuses to boot.
        $placeholders = $this->app->make(StripeCatalog::class)->placeholders();
        if ($placeholders !== []) {
            if ($this->app->isProduction()) {
                $keys = implode(', ', array_map(fn (array $p): string => $p['scope'].':'.$p['key'], $placeholders));
                throw new InvalidConfiguration("Placeholder or empty Stripe price IDs in config/catalog.php: {$keys}");
            }
            Log::error('[stripe] Placeholder Stripe price IDs detected in the package price map', ['placeholders' => $placeholders]);
        }

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
