<?php

namespace App\Support\Uploads\Image;

use App\Support\Uploads\UploadValidationException;

/** Byte helpers shared by the image validators. Reads past the end give null, like an out-of-range Uint8Array index. */
final class Bytes
{
    public const int MAX_PIXELS = 40_000_000;

    public static function at(string $s, int $o): ?int
    {
        return isset($s[$o]) ? ord($s[$o]) : null;
    }

    public static function u16le(string $s, int $o): int
    {
        return (self::at($s, $o) ?? 0) | ((self::at($s, $o + 1) ?? 0) << 8);
    }

    public static function u32le(string $s, int $o): int
    {
        /** @var array{1: int} $u */
        $u = unpack('V', $s, $o);

        return $u[1];
    }

    public static function u32be(string $s, int $o): int
    {
        /** @var array{1: int} $u */
        $u = unpack('N', $s, $o);

        return $u[1];
    }

    public static function fail(string $code, string $message): never
    {
        throw new UploadValidationException($code, $message);
    }

    /** assertDimensions (upload-validation.ts:53-60). 64-bit ints: width × height (≤ 2^64) overflows to float, still compared correctly. */
    public static function assertDimensions(int $width, int $height): void
    {
        if ($width <= 0 || $height <= 0) {
            self::fail('MALFORMED_IMAGE', 'Image has invalid dimensions');
        }
        if ($width * $height > self::MAX_PIXELS) {
            self::fail('IMAGE_DIMENSIONS_TOO_LARGE', 'Image exceeds the 40,000,000-pixel decode limit');
        }
    }
}
