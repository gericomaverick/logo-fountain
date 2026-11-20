<?php

use App\Http\Middleware\RequireCanonicalOrigin;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\TrustedClientAddress;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Http\Middleware\TrimStrings;
use Illuminate\Http\Middleware\ValidatePostSize;
use Illuminate\Routing\Route as RouteDefinition;
use Illuminate\Routing\Router;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Inertia\Middleware\EnsureDeferredCallbacksRun;

// Story 1.4 architecture test (X-01, ADR-008; ADR-020 pattern; replaces apps/web route-guards.test.ts,
// origin half). Fails if any mutating route under /api can be reached without the origin guard, if a
// mutating route elsewhere lacks the CSRF token check, or if the guard leaves its pipeline position.

const FOREIGN_ORIGIN = 'https://evil.example';

/** @return list<string> every way a registered route escapes its mutation control */
function mutationGuardViolations(): array
{
    /** @var Router $router */
    $router = app('router');
    $violations = [];
    foreach ($router->getRoutes()->getRoutes() as $route) {
        /** @var RouteDefinition $route */
        $path = trim($route->uri(), '/');
        foreach (array_diff($route->methods(), RequireCanonicalOrigin::SAFE_METHODS) as $method) {
            $label = "{$method} /{$path}";
            if ($path === 'api' || str_starts_with($path, 'api/')) {
                if (in_array($path, RequireCanonicalOrigin::EXEMPT_PATHS, true)) {
                    continue;
                }
                if (! RequireCanonicalOrigin::guards($method, $path)) {
                    $violations[] = "{$label}: not covered by RequireCanonicalOrigin::guards()";

                    continue;
                }
                // Behavioural proof through the real kernel: a foreign Origin never reaches the handler.
                $uri = '/'.preg_replace('/\{[^}]+\}/', 'x', $path);
                $res = test()->call($method, $uri, [], [], [], ['HTTP_ORIGIN' => FOREIGN_ORIGIN]);
                if ($res->status() !== 403 || $res->json('error.code') !== 'INVALID_ORIGIN') {
                    $violations[] = "{$label}: a foreign Origin got {$res->status()}, not 403 INVALID_ORIGIN";
                }
            } elseif (! in_array(PreventRequestForgery::class, $router->gatherRouteMiddleware($route), true)) {
                $violations[] = "{$label}: a mutation outside /api without PreventRequestForgery (web group)";
            }
        }
    }

    return $violations;
}

beforeEach(function () {
    config(['portal.public_site_url' => 'https://app.example.com']);
});

it('keeps SecurityHeaders, then TrustedClientAddress, then the guard, before body parsing and the web group', function () {
    /** @var Illuminate\Foundation\Http\Kernel $kernel */
    $kernel = app(Kernel::class);
    $global = $kernel->getGlobalMiddleware();

    $headers = array_search(SecurityHeaders::class, $global, true);
    expect(array_search(TrustedClientAddress::class, $global, true))->toBe($headers + 1)
        ->and(array_search(RequireCanonicalOrigin::class, $global, true))->toBe($headers + 2)
        // Only middleware that never reads the request may come first (Inertia's runs deferred callbacks after the response).
        ->and(array_slice($global, 0, (int) $headers))->toBe([EnsureDeferredCallbacksRun::class]);
    foreach ([ValidatePostSize::class, TrimStrings::class, ConvertEmptyStringsToNull::class] as $parser) {
        expect(array_search(RequireCanonicalOrigin::class, $global, true))->toBeLessThan(array_search($parser, $global, true));
    }
    // Session, cookies and auth live in route groups, which run after every global middleware.
    expect($global)->not->toContain(StartSession::class);
});

it('pins the exemptions to X-01 (route-guards.test.ts MUTATION_ORIGIN_EXEMPTIONS)', function () {
    expect(RequireCanonicalOrigin::EXEMPT_PATHS)->toBe(['api/stripe/webhook', 'api/checkout/magic-link', 'api/checkout/resend-magic-link'])
        ->and(RequireCanonicalOrigin::SAFE_METHODS)->toBe(['GET', 'HEAD', 'OPTIONS']);
});

it('excludes exactly /api/* from PreventRequestForgery', function () {
    expect(app(PreventRequestForgery::class)->getExcludedPaths())->toBe(['api/*']);
});

it('finds no mutation route without its guard', function () {
    expect(mutationGuardViolations())->toBe([]);
});

it('catches routes that escape (self-test)', function () {
    Route::post('/_arch/bare', fn () => 'bare');                        // no web group: no CSRF
    Route::post('/api/_arch/ok', fn () => 'ok');                        // guarded by the global middleware
    Route::put('/api/_arch/{id}', fn () => 'ok')
        ->withoutMiddleware(RequireCanonicalOrigin::class);             // a global middleware can't be removed per route
    Route::post('/_arch/form', fn () => 'form')->middleware('web');     // CSRF via the web group
    Route::post('/_arch/form-bare', fn () => 'form')->middleware('web')
        ->withoutMiddleware(PreventRequestForgery::class);              // CSRF removed

    expect(mutationGuardViolations())->toBe([
        'POST /_arch/bare: a mutation outside /api without PreventRequestForgery (web group)',
        'POST /_arch/form-bare: a mutation outside /api without PreventRequestForgery (web group)',
    ]);
});
