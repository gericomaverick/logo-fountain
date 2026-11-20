<?php

use App\Domain\CanonicalOrigin;
use App\Domain\PublicSiteUrlRequired;
use Illuminate\Http\Request;

// X-04: port of getSecuritySensitivePublicOrigin (apps/web/src/lib/request-origin.ts:115-141).

function origin(?string $configured, bool $production, ?Request $request = null, ?string $appUrl = null): string
{
    return (new CanonicalOrigin($configured, $production, $appUrl))->resolve($request);
}

it('uses the configured origin, dropping path, query, fragment and the default port', function (string $configured, string $expected) {
    expect(origin($configured, production: true))->toBe($expected);
})->with([
    ['https://portal.logofountain.com', 'https://portal.logofountain.com'],
    ['https://portal.logofountain.com/', 'https://portal.logofountain.com'],
    ['https://Portal.LogoFountain.COM/some/path?q=1#frag', 'https://portal.logofountain.com'],
    ['HTTPS://portal.logofountain.com:443', 'https://portal.logofountain.com'],
    ['https://portal.logofountain.com:8443', 'https://portal.logofountain.com:8443'],
    ['https://[2001:db8::1]:8443/x', 'https://[2001:db8::1]:8443'],
]);

it('accepts an http PUBLIC_SITE_URL outside production only', function () {
    expect(origin('http://127.0.0.1:18083/', production: false))->toBe('http://127.0.0.1:18083')
        ->and(origin('http://portal.example:80', production: false))->toBe('http://portal.example');
    origin('http://portal.logofountain.com', production: true);
})->throws(PublicSiteUrlRequired::class, 'A valid canonical PUBLIC_SITE_URL is required for security-sensitive redirects.');

it('rejects a malformed, non-http(s) or credentialed PUBLIC_SITE_URL in every environment', function (string $configured, bool $production) {
    origin($configured, $production);
})->throws(PublicSiteUrlRequired::class)->with([
    'not a url' => ['portal.logofountain.com', false],
    'ftp' => ['ftp://portal.logofountain.com', false],
    'javascript' => ['javascript:alert(1)', false],
    'username' => ['https://admin@portal.logofountain.com', true],
    'password' => ['https://admin:secret@portal.logofountain.com', true],
    'no host' => ['https:///path', false],
    'space in host' => ['https://portal logofountain.com', false],
    'backslash' => ['https://portal.logofountain.com\\evil.example', false],
    'bad ipv6' => ['https://[not-ipv6]/', false],
    'production too' => ['ftp://portal.logofountain.com', true],
]);

it('falls back to a loopback request origin outside production when unset', function (string $url, string $expected) {
    expect(origin(null, false, Request::create($url)))->toBe($expected)
        ->and(origin('', false, Request::create($url)))->toBe($expected);
})->with([
    ['http://localhost:8080/api/x', 'http://localhost:8080'],
    ['http://127.0.0.1:18083/api/x', 'http://127.0.0.1:18083'],
    ['https://localhost/api/x', 'https://localhost'],
    ['http://[::1]:8080/api/x', 'http://[::1]:8080'],
]);

it('refuses a non-loopback request origin when unset', function () {
    origin(null, false, Request::create('http://portal.example/api/x'));
})->throws(PublicSiteUrlRequired::class);

it('never reads the Host or forwarded headers in production', function () {
    $request = Request::create('http://localhost/api/x', 'POST', server: ['HTTP_X_FORWARDED_HOST' => 'localhost']);
    origin(null, true, $request);
})->throws(PublicSiteUrlRequired::class);

it('refuses in production with no PUBLIC_SITE_URL and no request', function () {
    origin(null, true);
})->throws(PublicSiteUrlRequired::class);

it('defaults to a loopback APP_URL, else http://localhost:3000, outside production with no request', function () {
    expect(origin(null, false, null, 'http://localhost:8080'))->toBe('http://localhost:8080')
        ->and(origin(null, false, null, 'https://portal.example'))->toBe('http://localhost:3000')
        ->and(origin(null, false))->toBe('http://localhost:3000');
});
