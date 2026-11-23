<?php

namespace App\Support\Auth;

/**
 * A-13 (story 4.8): Next `safeAuthNextPath` (`lib/auth/safe-next.ts:22-42`). Accepts only an application-relative
 * path for post-auth navigation. Only the pathname is decoded and checked; query and fragment are preserved.
 * Returns the original (never the decoded) value. The shared fixture `tests/parity/fixtures/rules/safe-next.json`
 * is the single source of truth for both stacks.
 */
final class SafeNext
{
    public const DEFAULT = '/dashboard';

    public static function path(?string $raw, string $fallback = self::DEFAULT): string
    {
        if ($raw === null || $raw === '') {
            return $fallback;
        }
        $pathname = self::pathname($raw);
        if (! self::hasSafeShape($pathname)) {
            return $fallback;
        }

        // Decode once, then keep decoding only while a nested layer can become a slash, backslash, control
        // byte or another encoded layer. A successful decode shortens the value, so strlen($raw) bounds it.
        $decoded = $pathname;
        $limit = strlen($raw);
        for ($pass = 0; $pass < $limit && str_contains($decoded, '%'); $pass++) {
            $next = self::decodeUriComponent($decoded);
            if ($next === null || ! self::hasSafeShape($next)) {
                return $fallback;
            }
            $decoded = $next;
            if (preg_match('/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f|25)/i', $decoded) !== 1) {
                break;
            }
        }

        return $raw;
    }

    /** `raw.split(/[?#]/, 1)[0]`. */
    private static function pathname(string $raw): string
    {
        return substr($raw, 0, strcspn($raw, '?#'));
    }

    private static function hasSafeShape(string $value): bool
    {
        return str_starts_with($value, '/')
            && ! str_starts_with($value, '//')
            && ! str_contains($value, '\\')
            && preg_match('/[\x00-\x1f\x7f]/', $value) !== 1;
    }

    /** JS `decodeURIComponent`: null where it would throw (a bare `%`, bad hex, or bytes that are not UTF-8). */
    private static function decodeUriComponent(string $value): ?string
    {
        if (preg_match('/%(?![0-9a-fA-F]{2})/', $value) === 1) {
            return null;
        }
        $decoded = rawurldecode($value);

        return mb_check_encoding($decoded, 'UTF-8') ? $decoded : null;
    }
}
