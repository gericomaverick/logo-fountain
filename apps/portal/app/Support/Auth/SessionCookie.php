<?php

namespace App\Support\Auth;

use App\Support\InvalidConfiguration;

/**
 * A-03 (story 4.1, ADR-005, Next `lib/auth/server.ts:37`): the session cookie's name and `Secure` flag.
 * Production: `__Host-lf_session`, Secure (the `__Host-` prefix needs Secure, Path=/ and no Domain).
 * Elsewhere: `lf_session`, Secure only when the canonical origin is https. Read by `config/session.php`.
 */
final class SessionCookie
{
    public const PRODUCTION_NAME = '__Host-lf_session';

    public const DEV_NAME = 'lf_session';

    /** @return array{cookie: string, secure: bool} */
    public static function settings(bool $production, ?string $canonicalOrigin): array
    {
        return $production
            ? ['cookie' => self::PRODUCTION_NAME, 'secure' => true]
            : ['cookie' => self::DEV_NAME, 'secure' => is_string($canonicalOrigin) && str_starts_with(strtolower($canonicalOrigin), 'https://')];
    }

    /**
     * Production boot check (FR57): refuse a session config that breaks the `__Host-` rules.
     *
     * @param  array<string, mixed>  $session  `config('session')`
     *
     * @throws InvalidConfiguration
     */
    public static function assertProductionValid(array $session): void
    {
        $ok = ($session['cookie'] ?? null) === self::PRODUCTION_NAME
            && ($session['secure'] ?? null) === true
            && ($session['http_only'] ?? null) === true
            && ($session['path'] ?? null) === '/'
            && ($session['domain'] ?? null) === null
            && strtolower((string) ($session['same_site'] ?? '')) === 'lax';

        if (! $ok) {
            throw new InvalidConfiguration('The session cookie must be __Host-lf_session, Secure, HttpOnly, SameSite=Lax, Path=/ with no Domain in production (ADR-005).');
        }
    }
}
