<?php

// Story 1.6 (X-02, ADR-027): the next.config.ts headers on every response.

use App\Http\Middleware\SecurityHeaders;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;

const NEXT_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; "
    ."script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; "
    ."font-src 'self' data:; connect-src 'self' https://api.stripe.com; "
    .'frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com; '
    ."worker-src 'self' blob:; manifest-src 'self'";

function assertSiteHeaders(TestResponse $res, string $referrer = 'strict-origin-when-cross-origin'): void
{
    $res->assertHeader('Content-Security-Policy-Report-Only', NEXT_CSP)
        ->assertHeader('X-Frame-Options', 'DENY')
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('Referrer-Policy', $referrer)
        ->assertHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com"), usb=()')
        ->assertHeaderMissing('Content-Security-Policy')
        ->assertHeaderMissing('Strict-Transport-Security');
}

it('sends the production CSP exactly as next.config.ts (testing env)', function () {
    expect(SecurityHeaders::contentSecurityPolicy())->toBe(NEXT_CSP);
});

it('adds unsafe-eval locally, like next dev', function () {
    app()->detectEnvironment(fn () => 'local');

    expect(SecurityHeaders::contentSecurityPolicy())
        ->toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com");
});

it('puts the headers on pages, the health check, 404s and API JSON', function () {
    Route::get('/api/_test/json', fn () => response()->json(['ok' => true]));

    assertSiteHeaders($this->get('/')->assertOk());
    assertSiteHeaders($this->get('/up')->assertOk());
    assertSiteHeaders($this->get('/no-such-page')->assertNotFound());
    assertSiteHeaders($this->getJson('/api/no-such-endpoint')->assertNotFound());
    assertSiteHeaders($this->get('/api/_test/json')->assertOk());
});

it('overrides a route\'s own Referrer-Policy, as next.config does on /api/auth/*', function () {
    Route::get('/api/_test/referrer', fn () => response()->json([])->header('Referrer-Policy', 'no-referrer'));

    assertSiteHeaders($this->get('/api/_test/referrer'));
});

it('sends no-referrer and exactly no-store on the three token pages', function (string $path) {
    Route::get($path, fn () => response('page')->cookie('probe', 'v'));

    $res = $this->get($path)->assertOk();
    assertSiteHeaders($res, 'no-referrer');
    expect($res->headers->get('Cache-Control'))->toBe('no-store')
        ->and($res->headers->getCookies())->toHaveCount(1);
})->with(['/auth/callback', '/set-password', '/reset-password']);

it('keeps the default caching elsewhere', function () {
    expect($this->get('/')->headers->get('Cache-Control'))->not->toContain('no-store');
});
