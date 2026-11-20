<?php

use App\Http\Middleware\EnsureAuthAvailable;
use App\Http\Middleware\RequireCanonicalOrigin;
use Illuminate\Support\Facades\Route;

// Story 1.3 AC 1 (X-04, A-17, FR57). There are no product endpoints yet, so the middleware is
// proven on routes registered only inside this test. Auth routes stack the checks in the Next
// order (lib/auth/http.ts:18-22): proxy check first, then the origin guard.

const PUBLIC_SITE_URL_REQUIRED = ['error' => ['code' => 'PUBLIC_SITE_URL_REQUIRED', 'message' => 'Request validation is temporarily unavailable.']];
const AUTH_UNAVAILABLE = ['error' => ['code' => 'AUTH_UNAVAILABLE', 'message' => 'Authentication is temporarily unavailable.']];

beforeEach(function () {
    Route::match(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], '/_test/mutation', fn () => response()->json([
        'ok' => true,
        'canonical' => request()->attributes->get(RequireCanonicalOrigin::ATTRIBUTE),
    ]))->middleware(RequireCanonicalOrigin::class);
    Route::match(['GET', 'POST'], '/_test/auth', fn () => response()->json(['ok' => true]))
        ->middleware([EnsureAuthAvailable::class, RequireCanonicalOrigin::class]);
});

function production(array $config = []): void
{
    app()->detectEnvironment(fn () => 'production');
    config($config);
}

it('answers guarded mutations with 503 PUBLIC_SITE_URL_REQUIRED in production with an http PUBLIC_SITE_URL', function (string $method) {
    production(['portal.public_site_url' => 'http://portal.logofountain.com']);

    $res = $this->json($method, '/_test/mutation');

    $res->assertStatus(503)->assertExactJson(PUBLIC_SITE_URL_REQUIRED);
    expect($res->headers->get('Cache-Control'))->not->toContain('no-store');
})->with(['POST', 'PUT', 'PATCH', 'DELETE']);

it('does the same when PUBLIC_SITE_URL is unset or malformed in production, even from loopback', function (?string $value) {
    production(['portal.public_site_url' => $value]);

    $this->postJson('http://localhost/_test/mutation')->assertStatus(503)->assertExactJson(PUBLIC_SITE_URL_REQUIRED);
})->with([null, '', 'not a url', 'https://user:pw@portal.logofountain.com']);

it('leaves safe methods alone', function () {
    production(['portal.public_site_url' => 'http://portal.logofountain.com']);

    $this->getJson('/_test/mutation')->assertOk();
});

it('passes mutations with an https PUBLIC_SITE_URL and exposes the canonical origin', function () {
    production(['portal.public_site_url' => 'https://Portal.LogoFountain.com/']);

    $this->postJson('/_test/mutation')->assertOk()->assertJson(['canonical' => 'https://portal.logofountain.com']);
});

it('uses the loopback request origin outside production when PUBLIC_SITE_URL is unset', function () {
    config(['portal.public_site_url' => null]);

    $this->postJson('http://127.0.0.1:18083/_test/mutation')->assertOk()->assertJson(['canonical' => 'http://127.0.0.1:18083']);
    $this->postJson('http://portal.example/_test/mutation')->assertStatus(503)->assertExactJson(PUBLIC_SITE_URL_REQUIRED);
});

it('answers auth with 503 AUTH_UNAVAILABLE in production with an http PUBLIC_SITE_URL and no proxy config', function (string $method) {
    production(['portal.public_site_url' => 'http://portal.logofountain.com', 'portal.auth_client_ip_header' => null, 'portal.auth_trusted_proxy_hops' => null]);

    $res = $this->json($method, '/_test/auth', [], ['CF-Connecting-IP' => '203.0.113.7']);

    $res->assertStatus(503)->assertExactJson(AUTH_UNAVAILABLE);
    expect($res->headers->get('Cache-Control'))->toContain('no-store');
    // The same request to a non-auth mutation gets the origin failure.
    $this->postJson('/_test/mutation')->assertStatus(503)->assertExactJson(PUBLIC_SITE_URL_REQUIRED);
})->with(['GET', 'POST']);

it('answers auth with 503 AUTH_UNAVAILABLE in production when the configured address is missing or malformed', function (array $headers) {
    production(['portal.public_site_url' => 'https://portal.logofountain.com', 'portal.auth_client_ip_header' => 'cf-connecting-ip']);

    $this->postJson('/_test/auth', [], $headers)->assertStatus(503)->assertExactJson(AUTH_UNAVAILABLE);
})->with([
    'missing' => [[]],
    'not an ip' => [['CF-Connecting-IP' => 'unknown']],
    'a list' => [['CF-Connecting-IP' => '203.0.113.7, 198.51.100.1']],
    'only x-forwarded-for' => [['X-Forwarded-For' => '203.0.113.7']],
]);

it('answers auth with 503 AUTH_UNAVAILABLE in production when both or invalid proxy settings are set', function (array $proxy) {
    production(['portal.public_site_url' => 'https://portal.logofountain.com', ...$proxy]);

    $this->postJson('/_test/auth', [], ['CF-Connecting-IP' => '203.0.113.7', 'X-Forwarded-For' => '203.0.113.7'])
        ->assertStatus(503)->assertExactJson(AUTH_UNAVAILABLE);
})->with([
    'both' => [['portal.auth_client_ip_header' => 'cf-connecting-ip', 'portal.auth_trusted_proxy_hops' => '1']],
    'forbidden header' => [['portal.auth_client_ip_header' => 'host']],
    'bad hops' => [['portal.auth_trusted_proxy_hops' => '0']],
]);

it('serves auth in production with a trusted address, then applies the origin check', function () {
    production(['portal.public_site_url' => 'https://portal.logofountain.com', 'portal.auth_client_ip_header' => 'cf-connecting-ip']);
    $this->postJson('/_test/auth', [], ['CF-Connecting-IP' => '203.0.113.7'])->assertOk();

    config(['portal.public_site_url' => 'http://portal.logofountain.com']);
    $this->postJson('/_test/auth', [], ['CF-Connecting-IP' => '203.0.113.7'])->assertStatus(503)->assertExactJson(PUBLIC_SITE_URL_REQUIRED);
});

it('takes the hop-counted X-Forwarded-For entry in production', function () {
    production(['portal.public_site_url' => 'https://portal.logofountain.com', 'portal.auth_trusted_proxy_hops' => '1']);

    $this->postJson('/_test/auth', [], ['X-Forwarded-For' => '6.6.6.6, 203.0.113.7'])->assertOk();
});

it('never fails auth closed outside production', function () {
    config(['portal.auth_client_ip_header' => null, 'portal.auth_trusted_proxy_hops' => null]);

    $this->postJson('http://localhost/_test/auth')->assertOk();
});
