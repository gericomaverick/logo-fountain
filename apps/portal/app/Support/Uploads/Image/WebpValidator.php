<?php

namespace App\Support\Uploads\Image;

/** validateWebp (upload-validation.ts:136-168), check order preserved. */
final class WebpValidator
{
    public static function validate(string $b): void
    {
        $len = strlen($b);
        if ($len < 20 || substr($b, 0, 4) !== 'RIFF' || substr($b, 8, 4) !== 'WEBP') {
            Bytes::fail('FILE_SIGNATURE_MISMATCH', 'Not WebP');
        }
        if (Bytes::u32le($b, 4) + 8 !== $len) {
            Bytes::fail('MALFORMED_IMAGE', 'Invalid RIFF size');
        }
        $p = 12;
        $images = 0;
        $canvas = null;
        while ($p < $len) {
            if ($p + 8 > $len) {
                Bytes::fail('MALFORMED_IMAGE', 'Truncated WebP chunk');
            }
            $kind = substr($b, $p, 4);
            $size = Bytes::u32le($b, $p + 4);
            $d = $p + 8;
            if ($d + $size + ($size % 2) > $len) {
                Bytes::fail('MALFORMED_IMAGE', 'Invalid WebP chunk size');
            }
            if ($kind === 'ANIM' || $kind === 'ANMF') {
                Bytes::fail('MALFORMED_IMAGE', 'Animated WebP unsupported');
            }
            if ($kind === 'VP8X') {
                if ($p !== 12 || $size !== 10 || (ord($b[$d]) & 0xC3) !== 0 || ord($b[$d + 1]) !== 0 || ord($b[$d + 2]) !== 0 || ord($b[$d + 3]) !== 0) {
                    Bytes::fail('MALFORMED_IMAGE', 'Invalid/animated extended WebP');
                }
                $canvas = [
                    1 + ord($b[$d + 4]) + (ord($b[$d + 5]) << 8) + (ord($b[$d + 6]) << 16),
                    1 + ord($b[$d + 7]) + (ord($b[$d + 8]) << 8) + (ord($b[$d + 9]) << 16),
                ];
                Bytes::assertDimensions($canvas[0], $canvas[1]);
            } elseif ($kind === 'VP8 ' || $kind === 'VP8L') {
                if (++$images !== 1) {
                    Bytes::fail('MALFORMED_IMAGE', 'Multiple WebP image payloads');
                }
                if ($kind === 'VP8L') {
                    if ($size <= 5 || ord($b[$d]) !== 0x2F || (ord($b[$d + 4]) & 0xE0) !== 0) {
                        Bytes::fail('MALFORMED_IMAGE', 'Invalid VP8L header');
                    }
                    $bits = Bytes::u32le($b, $d + 1);
                    $width = ($bits & 0x3FFF) + 1;
                    $height = (($bits >> 14) & 0x3FFF) + 1;
                } else {
                    if ($size <= 10 || (ord($b[$d]) & 1) !== 0 || ord($b[$d + 3]) !== 0x9D || ord($b[$d + 4]) !== 1 || ord($b[$d + 5]) !== 0x2A) {
                        Bytes::fail('MALFORMED_IMAGE', 'Invalid VP8 keyframe');
                    }
                    $width = Bytes::u16le($b, $d + 6) & 0x3FFF;
                    $height = Bytes::u16le($b, $d + 8) & 0x3FFF;
                }
                Bytes::assertDimensions($width, $height);
                if ($canvas !== null && ($canvas[0] !== $width || $canvas[1] !== $height)) {
                    Bytes::fail('MALFORMED_IMAGE', 'WebP canvas/image mismatch');
                }
            } elseif (! in_array($kind, ['ALPH', 'ICCP', 'EXIF', 'XMP '], true)) {
                Bytes::fail('MALFORMED_IMAGE', 'Unsupported WebP chunk');
            }
            $p = $d + $size + ($size % 2);
        }
        if ($images !== 1) {
            Bytes::fail('MALFORMED_IMAGE', 'Missing WebP image payload');
        }
    }
}
