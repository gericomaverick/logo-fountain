<?php

use App\Http\Middleware\AuthJsonBoundary;
use App\Http\Middleware\EnsureAuthAvailable;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\RequireCanonicalOrigin;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\TrustedClientAddress;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        then: function (): void {
            Route::middleware('web')->group(__DIR__.'/../routes/auth.php');
        },
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Global order (prepend puts the newest first): SecurityHeaders → TrustedClientAddress →
        // RequireCanonicalOrigin → the framework's body parsers. The guard's auth paths run
        // EnsureAuthAvailable, which reads the address TrustedClientAddress stored (stories 1.4 + 1.5).
        // X-01 / ADR-008 (story 1.4): the CSRF control for /api/*, before body parsing, session and auth.
        $middleware->prepend(RequireCanonicalOrigin::class);
        // X-05 / ADR-010 (story 1.5): derive the trusted client address once, before anything uses it.
        $middleware->prepend(TrustedClientAddress::class);
        $middleware->preventRequestForgery(except: ['api/*']);
        // X-02 (story 1.6): outermost, so it runs last and overrides route values, as next.config does.
        $middleware->prepend(SecurityHeaders::class);
        // A-17 (story 1.6): `auth.json` on body-reading auth mutations, `auth.json:headers` on the rest.
        $middleware->alias(['auth.json' => AuthJsonBoundary::class]);
        // X-05 / ADR-010 (story 1.5): no forwarded header is ever trusted by the framework. Laravel's
        // TrustProxies trusts every proxy on *.on-forge.com hosts and Laravel Cloud, which would let a
        // spoofed X-Forwarded-For/-Proto/-Host reach ip(), isSecure() and the host. The client
        // address comes only from TrustedClientAddress (AUTH_CLIENT_IP_HEADER / AUTH_TRUSTED_PROXY_HOPS).
        $middleware->remove(TrustProxies::class);

        // Story 4.1: the proxy check precedes the session lookup (`session/route.ts:6`), so it outranks StartSession.
        $middleware->prependToPriorityList(before: StartSession::class, prepend: EnsureAuthAvailable::class);

        $middleware->web(append: [
            HandleInertiaRequests::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
