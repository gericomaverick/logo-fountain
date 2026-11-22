<?php

use App\Models\User;
use App\Support\Auth\IssueSession;
use App\Support\Auth\SessionCookie;
use App\Support\InvalidConfiguration;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Story 4.1 AC 7 (A-03, ADR-005): cookie attributes from config and from a real Set-Cookie.

beforeEach(function () {
    Route::get('/api/_test/issue', function (Request $r) {
        (new IssueSession)(User::query()->firstOrFail(), $r->session());

        return response()->json(['ok' => true]);
    })->middleware('web');
});

it('derives name and Secure from the environment', function (bool $prod, ?string $origin, string $name, bool $secure) {
    expect(SessionCookie::settings($prod, $origin))->toBe(['cookie' => $name, 'secure' => $secure]);
})->with([
    'production' => [true, 'https://logofountain.example', '__Host-lf_session', true],
    'production, even without an origin' => [true, null, '__Host-lf_session', true],
    'dev http' => [false, 'http://localhost:8080', 'lf_session', false],
    'dev unset' => [false, null, 'lf_session', false],
    'dev https' => [false, 'https://staging.example', 'lf_session', true],
]);

it('ships the __Host- shape in the config files', function () {
    $c = config('session');
    expect($c['path'])->toBe('/')->and($c['domain'])->toBeNull()->and($c['http_only'])->toBeTrue()->and(strtolower($c['same_site']))->toBe('lax');
});

it('refuses a production session config that breaks the __Host- rules', function (string $key, mixed $value) {
    $good = ['cookie' => '__Host-lf_session', 'secure' => true, 'http_only' => true, 'path' => '/', 'domain' => null, 'same_site' => 'lax'];
    SessionCookie::assertProductionValid($good);

    SessionCookie::assertProductionValid([$key => $value] + $good);
})->throws(InvalidConfiguration::class)->with([
    ['cookie', 'lf_session'], ['secure', false], ['http_only', false], ['path', '/app'], ['domain', 'example.test'], ['same_site', 'none'],
]);

it('sets the production cookie on a real response', function () {
    config(['session.driver' => 'database'] + collect(SessionCookie::settings(true, 'https://logofountain.example'))->mapWithKeys(fn ($v, $k) => ["session.$k" => $v])->all());
    User::factory()->create();

    $res = $this->get('https://localhost/api/_test/issue');
    $cookie = collect($res->headers->getCookies())->first(fn ($c) => $c->getName() === '__Host-lf_session');

    expect($cookie)->not->toBeNull()
        ->and($cookie->isSecure())->toBeTrue()->and($cookie->isHttpOnly())->toBeTrue()
        ->and($cookie->getPath())->toBe('/')->and($cookie->getDomain())->toBeNull()
        ->and(strtolower((string) $cookie->getSameSite()))->toBe('lax');
});

it('sets lf_session without Secure on a real http dev response', function () {
    config(['session.driver' => 'database']);
    User::factory()->create();

    $res = $this->get('/api/_test/issue');
    $cookie = collect($res->headers->getCookies())->first(fn ($c) => $c->getName() === 'lf_session');

    expect($cookie)->not->toBeNull()->and($cookie->isSecure())->toBeFalse()->and($cookie->isHttpOnly())->toBeTrue();
});
