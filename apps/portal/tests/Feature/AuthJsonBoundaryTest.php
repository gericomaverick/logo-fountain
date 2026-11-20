<?php

// Story 1.6 (A-17): the auth JSON wrapper of apps/web/src/lib/auth/http.ts, on test routes
// (the real auth endpoints arrive in Epic 4). Mirrors auth-session.spec.ts:140-182.

use App\Exceptions\AuthFailure;
use App\Http\Middleware\AuthJsonBoundary;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;

const GENERIC = 'Authentication could not be completed. Check your details or request a new link.';

beforeEach(function () {
    Route::post('/api/_test/auth/echo', fn (Request $r) => AuthJsonBoundary::json(['body' => AuthJsonBoundary::body($r)]))
        ->middleware('auth.json');
    Route::post('/api/_test/auth/fail', fn () => throw new AuthFailure(401, 'UNAUTHORIZED'))->middleware('auth.json');
    Route::post('/api/_test/auth/crash', fn () => throw new RuntimeException('SQLSTATE[08006] password=hunter2 at db.internal'))
        ->middleware('auth.json');
    Route::post('/api/_test/auth/limited', fn () => AuthJsonBoundary::json(['error' => ['code' => 'RATE_LIMITED']], 429))
        ->middleware('auth.json');
    Route::get('/api/_test/auth/session', fn () => response()->json(['authenticated' => false]))->middleware('auth.json:headers');
});

function raw(string $uri, string $body, string $type = 'application/json'): TestResponse
{
    return test()->call('POST', $uri, [], [], [], ['CONTENT_TYPE' => $type, 'HTTP_ACCEPT' => 'application/json'], $body);
}

function assertAuthHeaders(TestResponse $res): void
{
    expect($res->headers->get('Cache-Control'))->toBe('no-store')
        ->and($res->headers->get('Referrer-Policy'))->toBe('strict-origin-when-cross-origin');
}

it('passes a JSON object through and exposes the parsed body', function () {
    $res = raw('/api/_test/auth/echo', '{"email":"client.a@parity.test","n":1}');

    $res->assertOk()->assertExactJson(['body' => ['email' => 'client.a@parity.test', 'n' => 1]]);
    assertAuthHeaders($res);
});

it('accepts application/json with parameters, in any case', function (string $type) {
    raw('/api/_test/auth/echo', '{}', $type)->assertOk();
})->with(['application/json; charset=utf-8', 'Application/JSON', 'application/json;charset=utf-8']);

it('rejects any other content type with 400 INVALID_JSON and no message', function (string $type) {
    $res = raw('/api/_test/auth/echo', '{"email":"a@b.c"}', $type);

    $res->assertStatus(400)->assertExactJson(['error' => ['code' => 'INVALID_JSON']]);
    assertAuthHeaders($res);
})->with(['text/plain', '', 'application/jsonp', 'application/json-patch+json', 'multipart/form-data', 'application/x-www-form-urlencoded']);

it('accepts exactly 8192 bytes and rejects 8193 with 413 PAYLOAD_TOO_LARGE', function () {
    $pad = 8192 - strlen('{"p":""}');
    raw('/api/_test/auth/echo', '{"p":"'.str_repeat('x', $pad).'"}')->assertOk();

    $res = raw('/api/_test/auth/echo', '{"p":"'.str_repeat('x', $pad + 1).'"}');
    $res->assertStatus(413)->assertExactJson(['error' => ['code' => 'PAYLOAD_TOO_LARGE']]);
    assertAuthHeaders($res);
});

it('refuses a declared Content-Length over the cap before reading', function () {
    $this->call('POST', '/api/_test/auth/echo', [], [], [], ['CONTENT_TYPE' => 'application/json', 'CONTENT_LENGTH' => '9000'], '{}')
        ->assertStatus(413);
});

it('turns malformed JSON and non-object bodies into the generic 400 AUTH_FAILED', function (string $body) {
    $res = raw('/api/_test/auth/echo', $body);

    $res->assertStatus(400)->assertExactJson(['error' => ['code' => 'AUTH_FAILED', 'message' => GENERIC]]);
    assertAuthHeaders($res);
})->with(['{not json', '[]', 'null', '"text"', '42', 'true', '', ' ']);

it('decodes like TextDecoder + JSON.parse: BOM dropped, invalid UTF-8 replaced', function () {
    raw('/api/_test/auth/echo', "\xEF\xBB\xBF{\"a\":1}")->assertOk()->assertExactJson(['body' => ['a' => 1]]);
    raw('/api/_test/auth/echo', "{\"a\":\"x\xFFy\"}")->assertOk()->assertExactJson(['body' => ['a' => "x\u{FFFD}y"]]);
});

it('keeps an AuthFailure status and code with the generic message', function () {
    $res = raw('/api/_test/auth/fail', '{}');

    $res->assertStatus(401)->assertExactJson(['error' => ['code' => 'UNAUTHORIZED', 'message' => GENERIC]]);
    assertAuthHeaders($res);
});

it('hides any other exception behind 400 AUTH_FAILED, never the native message', function () {
    $res = raw('/api/_test/auth/crash', '{}');

    $res->assertStatus(400)->assertExactJson(['error' => ['code' => 'AUTH_FAILED', 'message' => GENERIC]]);
    expect($res->getContent())->not->toContain('hunter2')->not->toContain('SQLSTATE');
    assertAuthHeaders($res);
});

it('leaves a route\'s own auth responses alone', function () {
    raw('/api/_test/auth/limited', '{}')->assertStatus(429)->assertExactJson(['error' => ['code' => 'RATE_LIMITED']]);
});

it('only adds the headers in headers mode (GET session, logout)', function () {
    $res = $this->get('/api/_test/auth/session', ['Content-Type' => 'text/plain']);

    $res->assertOk()->assertExactJson(['authenticated' => false]);
    assertAuthHeaders($res);
});

it('keeps Set-Cookie when forcing no-store', function () {
    Route::post('/api/_test/auth/cookie', fn () => AuthJsonBoundary::json(['ok' => true])->cookie('probe', 'v'))->middleware('auth.json');

    $res = raw('/api/_test/auth/cookie', '{}');
    $res->assertOk()->assertCookie('probe');
    assertAuthHeaders($res);
});
