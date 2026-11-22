<?php

use Illuminate\Support\Facades\Hash;
use Tests\Support\LoginRequests as L;
use Tests\Support\RateLimitBuckets;

// Story 4.3 AC 4 (A-01, ledger #66 case 11): reserved before the check, cleared on success, address bucket.

beforeEach(function () {
    config(['session.driver' => 'database', 'portal.auth_client_ip_header' => 'cf-connecting-ip']);
});

const ADDR = '203.0.113.9';

it('limits the sixth attempt even with the right password, and skips the hash', function () {
    $user = L::user();
    foreach (range(1, 5) as $_) {
        L::post(['email' => $user->email, 'password' => 'wrong-wrong'], ADDR)->assertStatus(400);
    }

    Hash::spy();
    L::post(['email' => $user->email, 'password' => L::PASSWORD], ADDR)->assertStatus(400)->assertJsonPath('error.code', 'INVALID_CREDENTIALS');
    Hash::shouldNotHaveReceived('check');
});

it('keys the failure bucket by email and address and clears it on success', function () {
    $user = L::user();
    L::post(['email' => $user->email, 'password' => 'wrong-wrong'], ADDR);
    L::post(['email' => $user->email, 'password' => 'wrong-wrong'], ADDR);
    expect(RateLimitBuckets::hits("login:failures:{$user->email}:".ADDR))->toBe(2);

    L::post(['email' => $user->email, 'password' => L::PASSWORD], ADDR)->assertOk();

    expect(RateLimitBuckets::hits("login:failures:{$user->email}:".ADDR))->toBeNull()
        ->and(RateLimitBuckets::hits('/api/auth/login:address:'.ADDR))->toBe(3);
});

it('limits an address to 20 attempts across emails', function () {
    $user = L::user();
    foreach (range(1, 20) as $i) {
        L::post(['email' => "u{$i}@example.test", 'password' => 'wrong-wrong'], ADDR)->assertStatus(400);
    }

    L::post(['email' => $user->email, 'password' => L::PASSWORD], ADDR)->assertStatus(400);
    // Another address is unaffected.
    L::post(['email' => $user->email, 'password' => L::PASSWORD], '203.0.113.10')->assertOk();
});

it('does not let a spoofed X-Forwarded-For change the bucket key', function () {
    config(['portal.auth_client_ip_header' => null, 'portal.public_site_url' => 'https://app.example.com']);
    $user = L::user();
    foreach (range(1, 5) as $i) {
        test()->withHeaders(['Origin' => 'https://app.example.com', 'X-Forwarded-For' => "198.51.100.{$i}"])
            ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong-wrong'])->assertStatus(400);
    }

    expect(RateLimitBuckets::hits("login:failures:{$user->email}:unknown-address"))->toBe(5);
});
