<?php

use App\Support\AuthProxyConfig;
use App\Support\ClientAddress;
use Illuminate\Http\Request;

// Story 1.5 (X-05, ADR-010): port of apps/web/src/lib/auth/client-address.test.ts. Each `it` below
// is one Next `it` (same title, same assertions), followed by the Laravel-only edge cases. Next's
// preflight case (#6) needs a real artisan process: tests/Feature/ClientAddressPreflightTest.php.

/** `trustedClientAddress(new Headers(init), env)`. */
function clientAddress(array $headers, array $env): ?string
{
    $request = Request::create('/x', 'POST');
    foreach ($headers as $name => $value) {
        $request->headers->set($name, $value);
    }

    return ClientAddress::trusted($request, AuthProxyConfig::from($env['AUTH_CLIENT_IP_HEADER'] ?? null, $env['AUTH_TRUSTED_PROXY_HOPS'] ?? null));
}

const SPOOF = ['x-forwarded-for' => '203.0.113.9', 'x-real-ip' => '203.0.113.10', 'cf-connecting-ip' => '203.0.113.11'];

// Next #1
it('never reads forwarding headers without trusted-proxy config', function () {
    expect(clientAddress(SPOOF, []))->toBeNull()
        ->and(clientAddress(['x-forwarded-for' => '203.0.113.9, 198.51.100.7'], []))->toBeNull();
});

// Next #2
it('with N trusted appending hops, takes the Nth entry from the right; client-chosen left entries are ignored', function () {
    $chain = ['x-forwarded-for' => '203.0.113.9, 192.0.2.44, 198.51.100.7'];
    expect(clientAddress($chain, ['AUTH_TRUSTED_PROXY_HOPS' => '1']))->toBe('198.51.100.7')
        ->and(clientAddress($chain, ['AUTH_TRUSTED_PROXY_HOPS' => '2']))->toBe('192.0.2.44')
        // Changing the spoofed left-most value does not change the result.
        ->and(clientAddress(['x-forwarded-for' => '10.9.9.9, 192.0.2.44, 198.51.100.7'], ['AUTH_TRUSTED_PROXY_HOPS' => '1']))->toBe('198.51.100.7');
});

// Next #3
it('fails closed when the chain is shorter than the trusted hops or the hop setting is invalid', function () {
    expect(clientAddress(['x-forwarded-for' => '198.51.100.7'], ['AUTH_TRUSTED_PROXY_HOPS' => '2']))->toBeNull()
        ->and(clientAddress([], ['AUTH_TRUSTED_PROXY_HOPS' => '1']))->toBeNull();
    foreach (['0', '-1', 'one', '1.5', '100'] as $bad) {
        expect(clientAddress(['x-forwarded-for' => '198.51.100.7'], ['AUTH_TRUSTED_PROXY_HOPS' => $bad]))->toBeNull();
    }
});

// Next #4
it('with a named overwritten header, uses only that header and only a single valid IP', function () {
    expect(clientAddress(SPOOF, ['AUTH_CLIENT_IP_HEADER' => 'CF-Connecting-IP']))->toBe('203.0.113.11')
        ->and(clientAddress(['x-forwarded-for' => '198.51.100.7'], ['AUTH_CLIENT_IP_HEADER' => 'x-real-ip']))->toBeNull()
        ->and(clientAddress(['x-real-ip' => '203.0.113.9, 198.51.100.7'], ['AUTH_CLIENT_IP_HEADER' => 'x-real-ip']))->toBeNull()
        ->and(clientAddress(['x-real-ip' => '2001:db8::1'], ['AUTH_CLIENT_IP_HEADER' => 'x-real-ip']))->toBe('2001:db8::1');
});

// Next #5
it('treats configuring both modes as an error and trusts neither', function () {
    expect(clientAddress(SPOOF, ['AUTH_CLIENT_IP_HEADER' => 'x-real-ip', 'AUTH_TRUSTED_PROXY_HOPS' => '1']))->toBeNull();
});

// Next #7
it('preflight and request parser use the same configuration validator', function () {
    foreach ([[], ['AUTH_CLIENT_IP_HEADER' => 'x-real-ip', 'AUTH_TRUSTED_PROXY_HOPS' => '1'], ['AUTH_TRUSTED_PROXY_HOPS' => '0'], ['AUTH_CLIENT_IP_HEADER' => 'bad header'], ['AUTH_CLIENT_IP_HEADER' => 'host']] as $env) {
        expect(AuthProxyConfig::from($env['AUTH_CLIENT_IP_HEADER'] ?? null, $env['AUTH_TRUSTED_PROXY_HOPS'] ?? null))->toBeNull()
            ->and(clientAddress(SPOOF, $env))->toBeNull();
    }
    expect(AuthProxyConfig::from('x-real-ip', null))->toEqual(AuthProxyConfig::from(' X-Real-IP ', ''))
        ->and(AuthProxyConfig::from('x-real-ip', null)?->header)->toBe('x-real-ip')
        ->and(AuthProxyConfig::from('x-real-ip', null)?->hops)->toBeNull()
        ->and(AuthProxyConfig::from(null, '2')?->hops)->toBe(2)
        ->and(AuthProxyConfig::from(null, '2')?->header)->toBeNull();
});

// Laravel-only edge cases (story 1.5 Behaviour notes 1-5), each checked against Node in Docker.

it('returns the trimmed value exactly as sent, without normalising it', function () {
    $cf = ['AUTH_CLIENT_IP_HEADER' => 'cf-connecting-ip'];
    expect(clientAddress(['cf-connecting-ip' => " \t2001:DB8:0:0::1 "], $cf))->toBe('2001:DB8:0:0::1')
        ->and(clientAddress(['cf-connecting-ip' => '::ffff:203.0.113.7'], $cf))->toBe('::ffff:203.0.113.7');
});

it('follows Node isIP, not filter_var: zone IDs pass, leading zeros and trailing newlines fail', function (string $value, ?string $expected) {
    expect(clientAddress(['cf-connecting-ip' => $value], ['AUTH_CLIENT_IP_HEADER' => 'cf-connecting-ip']))->toBe($expected)
        ->and(clientAddress(['x-forwarded-for' => "6.6.6.6, {$value}"], ['AUTH_TRUSTED_PROXY_HOPS' => '1']))->toBe($expected);
})->with([
    'IPv6 zone ID (filter_var rejects)' => ['fe80::1%eth0', 'fe80::1%eth0'],
    'numeric zone ID' => ['fe80::1%1', 'fe80::1%1'],
    'zone ID with underscore' => ['fe80::1%a_b', null],
    'IPv4 leading zero' => ['01.2.3.4', null],
    'IPv4-mapped with leading zero' => ['::ffff:01.2.3.4', null],
    'bracketed IPv6' => ['[2001:db8::1]', null],
    'with a port' => ['203.0.113.7:443', null],
    'CIDR' => ['203.0.113.7/32', null],
    'short IPv4' => ['127.1', null],
    'unknown' => ['unknown', null],
]);

it('trims like JS on latin1 header bytes: NBSP and form feed go, NUL stays', function (string $value, ?string $expected) {
    expect(clientAddress(['cf-connecting-ip' => $value], ['AUTH_CLIENT_IP_HEADER' => 'cf-connecting-ip']))->toBe($expected);
})->with([
    'trailing NBSP byte' => ["203.0.113.7\xA0", '203.0.113.7'],
    'leading form feed' => ["\x0C203.0.113.7", '203.0.113.7'],
    'vertical tab' => ["203.0.113.7\x0B", '203.0.113.7'],
    'UTF-8 NBSP (two bytes)' => ["203.0.113.7\xC2\xA0", null],
    'trailing NUL' => ["203.0.113.7\0", null],
    'trailing newline' => ["203.0.113.7\n", '203.0.113.7'],
]);

it('joins repeated header lines with ", " like Headers.get, so two values are a list', function () {
    expect(clientAddress(['cf-connecting-ip' => ['203.0.113.7', '198.51.100.1']], ['AUTH_CLIENT_IP_HEADER' => 'cf-connecting-ip']))->toBeNull()
        ->and(clientAddress(['x-forwarded-for' => ['6.6.6.6', '203.0.113.7']], ['AUTH_TRUSTED_PROXY_HOPS' => '1']))->toBe('203.0.113.7')
        ->and(clientAddress(['x-forwarded-for' => ['6.6.6.6', '203.0.113.7']], ['AUTH_TRUSTED_PROXY_HOPS' => '2']))->toBe('6.6.6.6');
});

it('treats empty chain entries as entries, as split(",") does', function () {
    expect(clientAddress(['x-forwarded-for' => '203.0.113.7,'], ['AUTH_TRUSTED_PROXY_HOPS' => '1']))->toBeNull()
        ->and(clientAddress(['x-forwarded-for' => '203.0.113.7,'], ['AUTH_TRUSTED_PROXY_HOPS' => '2']))->toBe('203.0.113.7')
        ->and(clientAddress(['x-forwarded-for' => ''], ['AUTH_TRUSTED_PROXY_HOPS' => '1']))->toBeNull()
        ->and(clientAddress(['x-forwarded-for' => ' 203.0.113.7 '], ['AUTH_TRUSTED_PROXY_HOPS' => '1']))->toBe('203.0.113.7');
});

it('reads env values like JS: Unicode trim and full lowercasing', function () {
    expect(AuthProxyConfig::from("\u{FEFF}\u{3000}x-real-ip\u{00A0}", null)?->header)->toBe('x-real-ip')
        ->and(AuthProxyConfig::from(null, "\u{2028}2\u{FEFF}")?->hops)->toBe(2)
        // U+212A KELVIN SIGN lowercases to ASCII "k" in JS ("X-KEY".toLowerCase() === "x-key").
        ->and(AuthProxyConfig::from("X-\u{212A}EY", null)?->header)->toBe('x-key')
        ->and(AuthProxyConfig::from("x-real-ip\0", null))->toBeNull()
        ->and(AuthProxyConfig::from("\xFFx-real-ip", null))->toBeNull()
        ->and(AuthProxyConfig::from(null, "\u{0661}"))->toBeNull();
});

it('memoises the address in a request attribute and reads it back', function () {
    $request = Request::create('/x');
    $request->attributes->set(ClientAddress::ATTRIBUTE, '203.0.113.7');
    expect(ClientAddress::for($request))->toBe('203.0.113.7');

    $request->attributes->set(ClientAddress::ATTRIBUTE, null);
    expect(ClientAddress::for($request))->toBeNull();
});
