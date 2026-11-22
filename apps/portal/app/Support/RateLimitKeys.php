<?php

namespace App\Support;

/**
 * Story 2.5 (X-06, ADR-009): the logical bucket strings, as Next builds them, and their stored form. Only the
 * sha256 of a logical string is stored, so no email, address, session id or token is kept in clear.
 * Next: `lib/auth/rate-limit.ts:5,35-36,45,48`, `lib/checkout-auth-email-rate-limit.ts:23-25`.
 */
final class RateLimitKeys
{
    /** Lowercase hex sha256 (64 characters): the stored bucket key. */
    public static function hash(string $logical): string
    {
        return hash('sha256', $logical);
    }

    public static function authAddress(string $scope, string $address): string
    {
        return $scope.':address:'.$address;
    }

    public static function authIdentity(string $scope, string $identity): string
    {
        return $scope.':identity:'.$identity;
    }

    public static function loginAddress(string $address): string
    {
        return '/api/auth/login:address:'.$address;
    }

    /** Per (email, address) when the address is trusted, so a third party elsewhere can't lock the owner out. */
    public static function loginFailures(?string $address, string $email): string
    {
        return 'login:failures:'.$email.':'.($address ?? 'unknown-address');
    }

    public static function checkoutSession(string $sessionId): string
    {
        return 'checkout:session:'.self::opaque($sessionId);
    }

    public static function checkoutDestination(string $destination): string
    {
        return 'checkout:destination:'.self::opaque($destination);
    }

    /** Next's `opaqueKey` input: JS `trim()` then `toLowerCase()`. */
    public static function opaque(string $value): string
    {
        return NodeCompat::lower(NodeCompat::trimEnv($value));
    }
}
