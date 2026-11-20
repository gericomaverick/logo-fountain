<?php

use App\Http\Middleware\EnsureAuthAvailable;
use App\Support\ClientAddress;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Story 1.5 (X-05, ADR-010): the global TrustedClientAddress middleware, the framework's own proxy
// trust switched off, and the production fail-closed fed by the full port.

beforeEach(function () {
    Route::get('/_test/address', fn (Request $request) => response()->json([
        'address' => ClientAddress::for($request),
        'attribute' => $request->attributes->has(ClientAddress::ATTRIBUTE),
        'ip' => $request->ip(),
        'ips' => $request->ips(),
        'secure' => $request->isSecure(),
        'host' => $request->getHost(),
    ]));
    Route::post('/_test/auth-15', fn () => response()->json(['ok' => true]))->middleware(EnsureAuthAvailable::class);
    config(['portal.auth_client_ip_header' => null, 'portal.auth_trusted_proxy_hops' => null]);
});

const FORGED = [
    'X-Forwarded-For' => '6.6.6.6',
    'X-Forwarded-Proto' => 'https',
    'X-Forwarded-Host' => 'evil.example',
    'X-Forwarded-Port' => '8443',
    'Forwarded' => 'for=6.6.6.6;proto=https;host=evil.example',
    'CF-Connecting-IP' => '6.6.6.6',
];

it('derives the address once per request in a global middleware', function () {
    config(['portal.auth_client_ip_header' => 'cf-connecting-ip']);

    $this->getJson('/_test/address', ['CF-Connecting-IP' => '203.0.113.7'])
        ->assertOk()->assertJson(['address' => '203.0.113.7', 'attribute' => true]);
    $this->getJson('/_test/address', ['CF-Connecting-IP' => '203.0.113.7, 198.51.100.1'])
        ->assertJson(['address' => null, 'attribute' => true]);
});

it('never lets forwarded headers change ip(), isSecure() or the host, on any host', function (string $host) {
    $res = $this->call('GET', "http://{$host}/_test/address", server: [
        'REMOTE_ADDR' => '10.0.0.1',
        ...collect(FORGED)->mapWithKeys(fn ($v, $k) => ['HTTP_'.strtoupper(str_replace('-', '_', $k)) => $v])->all(),
    ]);

    // *.on-forge.com is where the framework's TrustProxies would have trusted every proxy.
    $res->assertOk()->assertExactJson(['address' => null, 'attribute' => true, 'ip' => '10.0.0.1', 'ips' => ['10.0.0.1'], 'secure' => false, 'host' => $host]);
})->with(['portal.logofountain.com', 'portal-abc.on-forge.com', 'localhost']);

it('keeps the address from the configured hop even when the framework would read X-Forwarded-For', function () {
    config(['portal.auth_trusted_proxy_hops' => '1']);

    $this->call('GET', 'http://x.on-forge.com/_test/address', server: ['REMOTE_ADDR' => '10.0.0.1', 'HTTP_X_FORWARDED_FOR' => '6.6.6.6, 203.0.113.7'])
        ->assertJson(['address' => '203.0.113.7', 'ip' => '10.0.0.1']);
});

it('answers auth 503 AUTH_UNAVAILABLE in production for addresses Node rejects, and serves those it accepts', function (string $value, int $status) {
    app()->detectEnvironment(fn () => 'production');
    config(['portal.auth_client_ip_header' => 'cf-connecting-ip']);

    $this->call('POST', '/_test/auth-15', server: ['HTTP_CF_CONNECTING_IP' => $value, 'HTTP_ACCEPT' => 'application/json'])->assertStatus($status);
})->with([
    'IPv4' => ['203.0.113.7', 200],
    'IPv6 zone ID (Node accepts)' => ['fe80::1%eth0', 200],
    'trailing NBSP byte (JS trim strips it)' => ["203.0.113.7\xA0", 200],
    'leading zero' => ['203.0.113.07', 503],
    'list' => ['203.0.113.7, 198.51.100.1', 503],
    'empty' => ['', 503],
]);

it('serves the address debug route only outside production (it is registered at boot)', function () {
    config(['portal.auth_client_ip_header' => 'cf-connecting-ip']);

    $this->getJson('/dev/client-address', ['CF-Connecting-IP' => '203.0.113.7', 'X-Forwarded-For' => '6.6.6.6, 198.51.100.1'])
        ->assertOk()->assertExactJson([
            'address' => '203.0.113.7', 'remoteAddr' => '127.0.0.1',
            'cfConnectingIp' => '203.0.113.7', 'xRealIp' => null, 'oneHop' => '198.51.100.1',
        ]);
});

// `->ip()` is the socket peer (a Cloudflare edge in production): the address is ClientAddress::for().
it('never reads the client IP through the framework in app code', function () {
    $offenders = [];
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(base_path('app'), FilesystemIterator::SKIP_DOTS));
    foreach ($files as $file) {
        if (! $file instanceof SplFileInfo || ! str_ends_with($file->getFilename(), '.php')) {
            continue;
        }
        // Code only: comments may explain why ip() is not used.
        $code = implode('', array_map(
            fn ($t) => is_array($t) ? (in_array($t[0], [T_COMMENT, T_DOC_COMMENT], true) ? '' : $t[1]) : $t,
            token_get_all((string) file_get_contents($file->getPathname())),
        ));
        if (preg_match('/->(ip|ips|getClientIp|getClientIps)\s*\(|REMOTE_ADDR|setTrustedProxies|trustProxies\s*\(/', $code) === 1) {
            $offenders[] = $file->getPathname();
        }
    }
    expect($offenders)->toBe([]);
});
