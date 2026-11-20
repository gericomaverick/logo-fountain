<?php

use App\Http\Middleware\EnsureAuthAvailable;
use App\Http\Middleware\RequireCanonicalOrigin;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;

// Story 1.4 (X-01, ADR-008): the mutation Origin guard. Ports the X-01 cases of
// apps/web/src/lib/request-origin.test.ts and the header variants of the parity specs
// (journeys/contract/origin-guard.spec.ts, auth-session.spec.ts:184-216). No product endpoint
// exists yet, so the guard is proven on routes registered only inside this test.

const CANONICAL = 'https://app.example.com';
const INVALID_ORIGIN = ['error' => ['code' => 'INVALID_ORIGIN', 'message' => 'Request origin is not allowed.']];

beforeEach(function () {
    config(['portal.public_site_url' => CANONICAL.'/path']);
    $handler = function () {
        app()->instance('origin-test.reached', true);

        return response()->json(['ok' => true, 'canonical' => request()->attributes->get(RequireCanonicalOrigin::ATTRIBUTE)]);
    };
    Route::match(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'], '/api/_test/mutation', $handler);
    Route::post('/api/stripe/webhook', fn () => response('webhook', 400));
    Route::post('/api/checkout/magic-link', fn () => response()->json(['error' => ['code' => 'NOT_FULFILLED']], 409));
    Route::post('/api/checkout/resend-magic-link', fn () => response()->json(['error' => ['code' => 'NOT_FULFILLED']], 409));
    Route::post('/api/auth/login', $handler);
    Route::post('/api/auth/logout', $handler)->middleware(EnsureAuthAvailable::class);
    Route::post('/_test/form', fn () => response('form'))->middleware('web');
});

/** @param  array<string, string>  $headers */
function mutate(string $method, array $headers, string $path = '/api/_test/mutation', string $content = '{}'): TestResponse
{
    $server = ['CONTENT_TYPE' => 'application/json'];
    foreach ($headers as $name => $value) {
        $server['HTTP_'.strtoupper(str_replace('-', '_', $name))] = $value;
    }

    return test()->call($method, 'https://internal.example'.$path, [], [], [], $server, $content);
}

function reached(): bool
{
    return app()->bound('origin-test.reached');
}

it('accepts only the exact canonical Origin', function (string $method) {
    mutate($method, ['Origin' => CANONICAL])->assertOk()->assertJson(['canonical' => CANONICAL]);
})->with(['POST', 'PUT', 'PATCH', 'DELETE']);

it('refuses every other Origin with 403 INVALID_ORIGIN before the handler', function (string $origin) {
    $res = mutate('POST', ['Origin' => $origin]);

    $res->assertStatus(403)->assertExactJson(INVALID_ORIGIN);
    expect(reached())->toBeFalse();
})->with([
    // request-origin.test.ts "accepts only the exact configured canonical origin"
    'null', 'https://evil.example', 'https://app.example.com.evil.example', 'https://user@app.example.com',
    'https://app.example.com/path', 'https://app.example.com?query=1', 'https://app.example.com\\@evil.example',
    'https://app.example.com%00.evil.example',
    // auth-session.spec.ts:187 (empty, trailing slash, other host or port, other scheme or case)
    '', 'https://app.example.com/', 'http://app.example.com', 'https://app.example.com:443', 'https://APP.example.com',
    'https://app.example.com:8443', 'http://127.0.0.1:1',
]);

it('never lets a canonical Referer rescue a failed Origin', function (string $origin) {
    mutate('PUT', ['Origin' => $origin, 'Referer' => CANONICAL.'/settings'])->assertStatus(403)->assertExactJson(INVALID_ORIGIN);
})->with(['null', 'https://evil.example', '', 'https://app.example.com/path']);

it('accepts a canonical Referer without an Origin', function (string $referer) {
    mutate('PUT', ['Referer' => $referer])->assertOk();
})->with([
    CANONICAL.'/settings?tab=profile',
    CANONICAL.'/',
    CANONICAL.'/login?next=%2Fdashboard',
    // WHATWG: a bare trailing "#" is an empty fragment, so `hash === ""` and Next accepts it.
    CANONICAL.'/login#',
]);

it('fails closed for unverified provenance without an Origin', function (array $headers) {
    mutate('PUT', $headers)->assertStatus(403)->assertExactJson(INVALID_ORIGIN);
    expect(reached())->toBeFalse();
})->with([
    'nothing' => [[]],
    'empty referer' => [['Referer' => '']],
    'alias host' => [['Referer' => 'https://alias.example/settings']],
    'suffix host' => [['Referer' => 'https://app.example.com.evil.example/settings']],
    'dot suffix host' => [['Referer' => 'https://app.example.com.evil.example/login']],
    'userinfo' => [['Referer' => 'https://user@app.example.com/settings']],
    'userinfo host' => [['Referer' => 'https://user:pw@app.example.com/login']],
    'at host' => [['Referer' => 'https://app.example.com@evil.example/settings']],
    'relative' => [['Referer' => '/settings']],
    'fragment' => [['Referer' => 'https://app.example.com/settings#fragment']],
    'no path' => [['Referer' => 'https://app.example.com']],
    'not a url' => [['Referer' => 'not a URL']],
    'backslash' => [['Referer' => 'https://app.example.com/lo\\gin']],
    'control char' => [['Referer' => "https://app.example.com/lo\x01gin"]],
    'foreign' => [['Referer' => 'https://evil.example/dashboard']],
    'sec-fetch-site and hosts' => [['Sec-Fetch-Site' => 'same-origin', 'Host' => 'app.example.com', 'X-Forwarded-Host' => 'app.example.com']],
]);

it('joins repeated headers as Fetch does, so two Origins never match', function () {
    expect(RequireCanonicalOrigin::hasCanonicalProvenance([CANONICAL, CANONICAL], [], CANONICAL))->toBeFalse()
        ->and(RequireCanonicalOrigin::hasCanonicalProvenance([CANONICAL], [], CANONICAL))->toBeTrue()
        ->and(RequireCanonicalOrigin::hasCanonicalProvenance([''], [CANONICAL.'/x'], CANONICAL))->toBeFalse()
        ->and(RequireCanonicalOrigin::hasCanonicalProvenance([], [CANONICAL.'/a', 'https://evil.example/'], CANONICAL))->toBeTrue()
        ->and(RequireCanonicalOrigin::hasCanonicalProvenance([], ['https://evil.example/', CANONICAL.'/a'], CANONICAL))->toBeFalse();
});

it('runs before body parsing, the session and auth', function () {
    // Not even JSON (auth-session.spec.ts:191): the guard answers before anything reads the body.
    $res = mutate('POST', ['Origin' => 'https://evil.example'], content: 'x{');

    $res->assertStatus(403)->assertExactJson(INVALID_ORIGIN);
    // No session was started (StartSession would queue the session and XSRF cookies).
    expect($res->headers->getCookies())->toBe([])
        // and the 403 has the X-02 headers but no `no-store` (brownfield auth-and-security correction 2).
        ->and($res->headers->get('X-Frame-Options'))->toBe('DENY')
        ->and((string) $res->headers->get('Cache-Control'))->not->toContain('no-store');
});

it('leaves safe methods alone', function (string $method) {
    mutate($method, ['Origin' => 'https://evil.example'])->assertOk();
})->with(['GET', 'HEAD', 'OPTIONS']);

it('decides on the real method, so an override cannot skip it', function (array $headers, string $content) {
    $res = test()->call('POST', 'https://internal.example/api/_test/mutation', [], [], [], [
        'HTTP_ORIGIN' => 'https://evil.example', 'CONTENT_TYPE' => 'application/x-www-form-urlencoded', ...$headers,
    ], $content);

    $res->assertStatus(403)->assertExactJson(INVALID_ORIGIN);
})->with([
    '_method OPTIONS' => [[], '_method=OPTIONS'],
    '_method GET' => [[], '_method=GET'],
    'header OPTIONS' => [['HTTP_X_HTTP_METHOD_OVERRIDE' => 'OPTIONS'], ''],
]);

it('guards the path Laravel routes on, however it is spelled', function (string $path) {
    mutate('POST', ['Origin' => 'https://evil.example'], $path)->assertStatus(403)->assertExactJson(INVALID_ORIGIN);
})->with(['/api/_test/mutation/', '/%61pi/_test/mutation', '/api/_test/%6Dutation', '/api', '/api/does-not-exist']);

it('exempts exactly the webhook and the checkout email endpoints', function (string $path, int $status) {
    foreach ([[], ['Origin' => 'https://evil.example'], ['Origin' => 'null']] as $headers) {
        mutate('POST', $headers, $path)->assertStatus($status);
    }
})->with([
    ['/api/stripe/webhook', 400],
    ['/api/stripe/webhook/', 400],
    ['/api/checkout/magic-link', 409],
    ['/api/checkout/resend-magic-link', 409],
]);

it('does not guard mutations outside /api (they keep the CSRF token check)', function () {
    $res = test()->call('POST', 'https://internal.example/_test/form', [], [], [], ['HTTP_ORIGIN' => 'https://evil.example']);

    // Pest skips PreventRequestForgery (runningUnitTests); the next test proves the token check itself.
    expect($res->status())->toBe(200);
});

it('excludes /api/* from PreventRequestForgery but keeps it for other posts', function () {
    $csrf = new class(app(), app('encrypter')) extends PreventRequestForgery
    {
        protected function runningUnitTests()
        {
            return false;
        }
    };
    $request = function (string $path) {
        $request = Request::create('https://internal.example'.$path, 'POST');
        $request->setLaravelSession(app('session')->driver('array'));

        return $request;
    };

    expect($csrf->handle($request('/api/projects/x/brief'), fn () => response('ok'))->getContent())->toBe('ok');
    expect(fn () => $csrf->handle($request('/_test/form'), fn () => response('ok')))->toThrow(TokenMismatchException::class);
});

it('answers 503 PUBLIC_SITE_URL_REQUIRED before the provenance check', function (?string $value) {
    // request-origin.test.ts "distinguishes configuration failure"
    app()->detectEnvironment(fn () => 'production');
    config(['portal.public_site_url' => $value]);

    mutate('POST', ['Origin' => CANONICAL])->assertStatus(503)
        ->assertExactJson(['error' => ['code' => 'PUBLIC_SITE_URL_REQUIRED', 'message' => 'Request validation is temporarily unavailable.']]);
})->with(['', 'invalid', 'http://app.example.com', 'https://user@app.example.com', 'file:///tmp/site', null]);

it('runs the production proxy check first on authMutation endpoints, and second on logout', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['portal.public_site_url' => CANONICAL, 'portal.auth_client_ip_header' => null, 'portal.auth_trusted_proxy_hops' => null]);

    // lib/auth/http.ts:18-22: proxy check, then origin.
    mutate('POST', ['Origin' => 'https://evil.example'], '/api/auth/login')->assertStatus(503)->assertJsonPath('error.code', 'AUTH_UNAVAILABLE');
    // app/api/auth/logout/route.ts:6-9: origin, then proxy check.
    mutate('POST', ['Origin' => 'https://evil.example'], '/api/auth/logout')->assertStatus(403)->assertExactJson(INVALID_ORIGIN);
    mutate('POST', ['Origin' => CANONICAL], '/api/auth/logout')->assertStatus(503)->assertJsonPath('error.code', 'AUTH_UNAVAILABLE');

    config(['portal.auth_client_ip_header' => 'cf-connecting-ip']);
    mutate('POST', ['Origin' => 'https://evil.example', 'CF-Connecting-IP' => '203.0.113.7'], '/api/auth/login')->assertStatus(403)->assertExactJson(INVALID_ORIGIN);
    mutate('POST', ['Origin' => CANONICAL, 'CF-Connecting-IP' => '203.0.113.7'], '/api/auth/login')->assertOk();
});

it('guards with the loopback request origin outside production when PUBLIC_SITE_URL is unset', function () {
    config(['portal.public_site_url' => null]);

    test()->call('POST', 'http://127.0.0.1:8000/api/_test/mutation', [], [], [], ['HTTP_ORIGIN' => 'http://127.0.0.1:8000'])->assertOk();
    test()->call('POST', 'http://127.0.0.1:8000/api/_test/mutation', [], [], [], ['HTTP_ORIGIN' => 'http://localhost:8000'])->assertStatus(403);
    test()->call('POST', 'http://127.0.0.1:8000/api/_test/mutation', [], [], [], ['HTTP_REFERER' => 'http://127.0.0.1:8000/dashboard'])->assertOk();
});
