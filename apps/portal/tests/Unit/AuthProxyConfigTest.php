<?php

use App\Support\AuthProxyConfig;
use App\Support\ClientAddress;
use Illuminate\Http\Request;

// A-17 / O-05: port of configuredAuthProxy (apps/web/src/lib/auth/proxy-config.mjs:4-14).

it('accepts exactly one valid setting', function (mixed $header, mixed $hops, ?string $expectHeader, ?int $expectHops) {
    $config = AuthProxyConfig::from($header, $hops);
    expect($config)->not->toBeNull()
        ->and($config?->header)->toBe($expectHeader)
        ->and($config?->hops)->toBe($expectHops);
})->with([
    'cloudflare header' => ['cf-connecting-ip', null, 'cf-connecting-ip', null],
    'trimmed, lowercased' => ['  X-Real-IP ', '', 'x-real-ip', null],
    'one hop' => [null, '1', null, 1],
    'max hops' => ['', ' 99 ', null, 99],
    'int hops' => [null, 2, null, 2],
]);

it('rejects both, neither or a malformed setting', function (mixed $header, mixed $hops) {
    expect(AuthProxyConfig::from($header, $hops))->toBeNull();
})->with([
    'neither' => [null, null],
    'both empty' => ['', '  '],
    'both set' => ['cf-connecting-ip', '1'],
    'forbidden host' => ['host', null],
    'forbidden origin' => ['origin', null],
    'forbidden referer' => ['Referer', null],
    'forbidden cookie' => ['cookie', null],
    'forbidden authorization' => ['authorization', null],
    'leading digit' => ['1-ip', null],
    'underscore' => ['x_real_ip', null],
    'colon' => ['x-real-ip:', null],
    'trailing newline inside' => ["x-real-ip\nx", null],
    'zero hops' => [null, '0'],
    '100 hops' => [null, '100'],
    'leading zero' => [null, '01'],
    'negative' => [null, '-1'],
    'decimal' => [null, '1.5'],
    'word' => [null, 'one'],
    'non-string' => [true, null],
]);

it('derives the address only from the configured header or hop', function () {
    $header = AuthProxyConfig::from('cf-connecting-ip', null);
    $hops = AuthProxyConfig::from(null, '2');
    $req = fn (array $server) => Request::create('/x', 'POST', server: $server);

    expect(ClientAddress::trusted($req(['HTTP_CF_CONNECTING_IP' => ' 203.0.113.7 ']), $header))->toBe('203.0.113.7')
        ->and(ClientAddress::trusted($req(['HTTP_CF_CONNECTING_IP' => '203.0.113.7, 198.51.100.1']), $header))->toBeNull()
        ->and(ClientAddress::trusted($req(['HTTP_CF_CONNECTING_IP' => 'nope']), $header))->toBeNull()
        ->and(ClientAddress::trusted($req(['HTTP_X_FORWARDED_FOR' => '203.0.113.7']), $header))->toBeNull()
        ->and(ClientAddress::trusted($req(['HTTP_X_FORWARDED_FOR' => '6.6.6.6, 203.0.113.7, 10.0.0.1']), $hops))->toBe('203.0.113.7')
        ->and(ClientAddress::trusted($req(['HTTP_X_FORWARDED_FOR' => '10.0.0.1']), $hops))->toBeNull()
        ->and(ClientAddress::trusted($req(['HTTP_CF_CONNECTING_IP' => '203.0.113.7']), null))->toBeNull();
});
