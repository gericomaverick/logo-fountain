<?php

namespace App\Providers;

use App\Actions\Checkout\FulfilsCheckout;
use App\Actions\Checkout\PendingFulfiller;
use App\Support\Storage\PrivateStorage;
use App\Support\Stripe\StripeCatalog;
use Illuminate\Support\ServiceProvider;
use Stripe\StripeClient;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Story 5.2: the webhook's fulfilment seam; story 5.3 rebinds it to the real FulfilCheckout.
        $this->app->bind(FulfilsCheckout::class, PendingFulfiller::class);
        $this->app->singleton(PrivateStorage::class, fn (): PrivateStorage => PrivateStorage::fromConfig());
        $this->app->singleton(StripeCatalog::class, fn (): StripeCatalog => StripeCatalog::fromConfig());
        // ADR-014: one client with the pinned API version. `api_base` points at stripe-fake in tests; a missing key
        // fails here, at first use (Next fails at import), and callers turn it into their own 500.
        $this->app->singleton(StripeClient::class, function (): StripeClient {
            $key = config('services.stripe.secret');
            $base = config('services.stripe.api_base');
            $version = config('services.stripe.api_version');

            return new StripeClient(array_filter([
                'api_key' => is_string($key) && $key !== '' ? $key : null,
                'stripe_version' => is_string($version) ? $version : null,
                'api_base' => is_string($base) && $base !== '' ? $base : null,
            ], fn ($v) => $v !== null));
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
