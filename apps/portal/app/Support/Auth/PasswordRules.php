<?php

namespace App\Support\Auth;

/**
 * Next `lib/auth/validation.ts:30-43` (`validateNewPassword`), shared by reset/set (4.6) and change (4.7).
 * Minimum 8 as JS counts it (UTF-16 code units, so an emoji is 2); maximum 72 BYTES (bcrypt ignores the rest,
 * so a longer password is refused rather than silently truncated).
 */
final class PasswordRules
{
    public const MIN_LENGTH = 8;

    public const MAX_BYTES = 72;

    public static function isAcceptable(string $password): bool
    {
        return self::utf16Units($password) >= self::MIN_LENGTH && strlen($password) <= self::MAX_BYTES;
    }

    /** JS `String.length`. */
    private static function utf16Units(string $value): int
    {
        return intdiv(strlen(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')), 2);
    }
}
