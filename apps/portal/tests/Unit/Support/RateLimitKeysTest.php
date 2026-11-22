<?php

use App\Support\RateLimitKeys;
use App\Support\RateLimits;

// Story 2.5 AC 3, AC 10 (X-06, ADR-009): logical bucket strings as Next (lib/auth/rate-limit.ts:35-36,45,48;
// lib/checkout-auth-email-rate-limit.ts:23-25) and their stored sha256 form. No database.

it('builds the auth bucket strings as Next', function () {
    expect(RateLimitKeys::authAddress('/api/auth/magic-link', '203.0.113.9'))->toBe('/api/auth/magic-link:address:203.0.113.9')
        ->and(RateLimitKeys::authIdentity('/api/auth/magic-link', 'a@example.com'))->toBe('/api/auth/magic-link:identity:a@example.com')
        ->and(RateLimitKeys::loginAddress('2001:db8::1'))->toBe('/api/auth/login:address:2001:db8::1')
        ->and(RateLimitKeys::loginFailures('203.0.113.9', 'a@example.com'))->toBe('login:failures:a@example.com:203.0.113.9')
        ->and(RateLimitKeys::loginFailures(null, 'a@example.com'))->toBe('login:failures:a@example.com:unknown-address');
});

it('normalises checkout values as Next opaqueKey: JS trim, then lowercase', function () {
    expect(RateLimitKeys::checkoutSession('  cs_Shared '))->toBe('checkout:session:cs_shared')
        ->and(RateLimitKeys::checkoutDestination(" \u{00A0}SAME@example.com \u{FEFF}"))->toBe('checkout:destination:same@example.com')
        ->and(RateLimitKeys::checkoutDestination("\u{212A}elvin@example.com"))->toBe('checkout:destination:kelvin@example.com')
        ->and(RateLimitKeys::checkoutDestination(' same@example.com '))->toBe(RateLimitKeys::checkoutDestination('same@example.com'));
});

it('stores a logical key as lowercase sha256 hex of 64 characters', function () {
    $stored = RateLimitKeys::hash('login:failures:a@example.com:unknown-address');

    expect($stored)->toMatch('/^[0-9a-f]{64}$/')
        ->and($stored)->toBe(hash('sha256', 'login:failures:a@example.com:unknown-address'))
        ->and(RateLimitKeys::hash('checkout:session:cs_1'))->not->toBe(RateLimitKeys::hash('checkout:destination:cs_1'));
});

it('uses the caps and windows of Next, and prunes no sooner than the longest window ends', function () {
    expect([RateLimits::AUTH_WINDOW_SECONDS, RateLimits::ADDRESS_LIMIT, RateLimits::IDENTITY_LIMIT, RateLimits::LOGIN_FAILURE_LIMIT])->toBe([900, 20, 5, 5])
        ->and([RateLimits::CHECKOUT_SESSION_LIMIT, RateLimits::CHECKOUT_SESSION_WINDOW_SECONDS])->toBe([3, 900])
        ->and([RateLimits::CHECKOUT_DESTINATION_LIMIT, RateLimits::CHECKOUT_DESTINATION_WINDOW_SECONDS])->toBe([5, 3600])
        ->and(RateLimits::PRUNE_AFTER_SECONDS)->toBeGreaterThanOrEqual(max(RateLimits::AUTH_WINDOW_SECONDS, RateLimits::CHECKOUT_SESSION_WINDOW_SECONDS, RateLimits::CHECKOUT_DESTINATION_WINDOW_SECONDS));
});
