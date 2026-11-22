<?php

namespace App\Support\Auth;

/**
 * Story 4.8 owns the real `safeAuthNextPath` (Next `lib/auth/safe-next.ts`). Until it lands, story 4.4 needs
 * the call to exist: this stub returns the default destination for every input. 4.8 replaces the body.
 */
final class SafeNext
{
    public const DEFAULT = '/dashboard';

    public static function path(?string $raw): string
    {
        return self::DEFAULT;
    }
}
