<?php

use App\Http\Middleware\AuthJsonBoundary;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\TrustedClientAddress;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // X-02 (story 1.6): outermost, so it runs last and overrides route values, as next.config does.
        $middleware->prepend(SecurityHeaders::class);
        // A-17 (story 1.6): `auth.json` on body-reading auth mutations, `auth.json:headers` on the rest.
        $middleware->alias(['auth.json' => AuthJsonBoundary::class]);
        // X-05 / ADR-010 (story 1.5): no forwarded header is ever trusted by the framework. Laravel's
        // TrustProxies trusts every proxy on *.on-forge.com hosts and Laravel Cloud, which would let a
        // spoofed X-Forwarded-For/-Proto/-Host reach ip(), isSecure() and the host. The client
        // address comes only from TrustedClientAddress (AUTH_CLIENT_IP_HEADER / AUTH_TRUSTED_PROXY_HOPS).
        $middleware->remove(TrustProxies::class);
        $middleware->append(TrustedClientAddress::class);

        $middleware->web(append: [
            HandleInertiaRequests::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
