<?php

use Illuminate\Support\Facades\Http;

// Story 1.5 (X-05, ADR-010, architecture §7 gap 3 "nginx overwrite of cf-connecting-ip / forged-header
// test"): through the real dev nginx (`web` service, docker/nginx/default.conf) and php-fpm, forged
// client-address headers are overwritten with the socket peer. Needs the `web` service running
// (`docker compose up`; CI starts it in portal.yml). The peer nginx sees is this app container.

it('overwrites forged CF-Connecting-IP, X-Real-IP and X-Forwarded-For with the socket peer', function () {
    $self = gethostbyname(gethostname());
    expect(filter_var($self, FILTER_VALIDATE_IP))->not->toBeFalse();

    $forged = Http::withHeaders([
        'CF-Connecting-IP' => '6.6.6.6',
        'X-Real-IP' => '6.6.6.7',
        'X-Forwarded-For' => '6.6.6.8, 6.6.6.9',
        'X_Real_IP' => '6.6.6.10',
        'CF_Connecting_IP' => '6.6.6.11',
    ])->timeout(10)->get('http://web/dev/client-address');

    expect($forged->status())->toBe(200)
        ->and($forged->json())->toMatchArray([
            'remoteAddr' => $self,
            'cfConnectingIp' => $self,
            'xRealIp' => $self,
            // nginx appends the peer to the client's chain; one trusted hop takes the peer.
            'oneHop' => $self,
        ]);

    $plain = Http::timeout(10)->get('http://web/dev/client-address')->json();
    expect($plain)->toMatchArray(['cfConnectingIp' => $self, 'xRealIp' => $self, 'oneHop' => $self]);
});

it('keeps duplicate header lines a list, so they never become a trusted address on their own', function () {
    // Two CF-Connecting-IP lines are overwritten too (fastcgi_param replaces every line of that name).
    $self = gethostbyname(gethostname());
    $res = Http::withHeaders(['CF-Connecting-IP' => ['6.6.6.6', '6.6.6.7']])->timeout(10)->get('http://web/dev/client-address');

    expect($res->json('cfConnectingIp'))->toBe($self);
});
