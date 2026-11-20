<?php

namespace App\Console\Commands;

use App\Domain\CanonicalOrigin;
use App\Domain\PublicSiteUrlRequired;
use App\Support\AuthProxyConfig;
use Illuminate\Console\Command;

/**
 * O-05: refuse to put a production release live without valid auth proxy config
 * (`apps/web/scripts/auth-proxy-preflight.mjs`). Run in the deploy script after the env is in place
 * and before the release is activated. Also checks the canonical PUBLIC_SITE_URL (FR57).
 */
final class ProxyPreflight extends Command
{
    protected $signature = 'proxy:preflight {--production : Check as production even when APP_ENV is not production}';

    protected $description = 'Fail unless the auth proxy config and the canonical PUBLIC_SITE_URL are valid for production';

    public function handle(): int
    {
        if (! $this->option('production') && ! $this->laravel->isProduction()) {
            return self::SUCCESS;
        }

        $failed = false;
        if (AuthProxyConfig::fromConfig() === null) {
            $this->error(AuthProxyConfig::PREFLIGHT_FAILURE);
            $failed = true;
        }

        $configured = config('portal.public_site_url');
        try {
            (new CanonicalOrigin(is_string($configured) ? $configured : null, production: true))->resolve();
        } catch (PublicSiteUrlRequired) {
            $this->error('PUBLIC_SITE_URL preflight failed: set an https PUBLIC_SITE_URL without credentials');
            $failed = true;
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
