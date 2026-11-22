<?php

namespace App\Support\Storage;

use InvalidArgumentException;

/** Presign lifetime: an integer 1-3600 seconds (r2.ts:27-30). Floats and numeric strings are rejected. */
final class SignedUrlExpiry
{
    public static function check(mixed $value): int
    {
        if (! is_int($value) || $value < 1 || $value > 3600) {
            throw new InvalidArgumentException('Signed URL expiry must be an integer between 1 and 3600 seconds');
        }

        return $value;
    }
}
