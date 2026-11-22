<?php

namespace App\Support\Auth;

/**
 * A-04 / ADR-005 (story 4.1): a session lives exactly seven days from sign-in, however active it is.
 * Next: `SESSION_SECONDS` (`lib/auth/server.ts:12`), `sessionFromHeaders` (`lib/auth/service.ts:18`).
 * 4.3, 4.5 and 4.7 import the constant and the check; nothing else decides expiry.
 */
final class SessionCap
{
    public const SECONDS = 604800;

    /** Valid iff `now < issued_at + 604800` (exactly seven days is dead). */
    public static function isLive(int $issuedAt, int $now): bool
    {
        return $now < $issuedAt + self::SECONDS;
    }
}
