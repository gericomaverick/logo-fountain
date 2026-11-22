<?php

namespace App\Support\Uploads\Image;

/** validatePng (upload-validation.ts:62-96), check order preserved: first failure wins. */
final class PngValidator
{
    public static function validate(string $b): void
    {
        $len = strlen($b);
        if ($len < 33 || substr($b, 0, 8) !== "\x89PNG\r\n\x1a\n") {
            Bytes::fail('FILE_SIGNATURE_MISMATCH', 'File is not a valid PNG');
        }
        if (Bytes::u32be($b, 8) !== 13 || substr($b, 12, 4) !== 'IHDR') {
            Bytes::fail('MALFORMED_IMAGE', 'PNG is missing its IHDR header');
        }
        Bytes::assertDimensions(Bytes::u32be($b, 16), Bytes::u32be($b, 20));
        $bitDepth = ord($b[24]);
        $colour = ord($b[25]);
        if (! in_array($bitDepth, [1, 2, 4, 8, 16], true) || ! in_array($colour, [0, 2, 3, 4, 6], true)
            || ord($b[26]) !== 0 || ord($b[27]) !== 0 || ord($b[28]) > 1) {
            Bytes::fail('MALFORMED_IMAGE', 'PNG has an unsupported or malformed IHDR header');
        }
        $depths = [0 => [1, 2, 4, 8, 16], 2 => [8, 16], 3 => [1, 2, 4, 8], 4 => [8, 16], 6 => [8, 16]];
        if (! in_array($bitDepth, $depths[$colour], true)) {
            Bytes::fail('MALFORMED_IMAGE', 'Invalid PNG colour/bit-depth combination');
        }

        $offset = 8;
        $foundEnd = $foundData = $dataEnded = $palette = false;
        while ($offset + 12 <= $len) {
            $length = Bytes::u32be($b, $offset);
            if ($length > $len - $offset - 12) {
                Bytes::fail('MALFORMED_IMAGE', 'PNG chunk is truncated');
            }
            $kind = substr($b, $offset + 4, 4);
            if (crc32(substr($b, $offset + 4, 4 + $length)) !== Bytes::u32be($b, $offset + 8 + $length)) {
                Bytes::fail('MALFORMED_IMAGE', 'PNG chunk CRC mismatch');
            }
            if ($kind === 'acTL' || $kind === 'fcTL' || $kind === 'fdAT') {
                Bytes::fail('MALFORMED_IMAGE', 'Animated PNG is not supported');
            }
            if ($kind === 'IHDR' && $offset !== 8) {
                Bytes::fail('MALFORMED_IMAGE', 'Duplicate PNG header');
            }
            if ($kind === 'PLTE') {
                if ($palette || $foundData || $length === 0 || $length % 3 !== 0 || $length > 768 || in_array($colour, [0, 4], true)) {
                    Bytes::fail('MALFORMED_IMAGE', 'Invalid PNG palette');
                }
                $palette = true;
            }
            if ($kind === 'IDAT') {
                if ($dataEnded || ($colour === 3 && ! $palette)) {
                    Bytes::fail('MALFORMED_IMAGE', 'Invalid PNG data order');
                }
                if ($length > 0) {
                    $foundData = true;
                }
            } elseif ($foundData) {
                $dataEnded = true;
            }
            if (preg_match('/\A[A-Za-z]{4}\z/', $kind) !== 1
                || (ctype_upper($kind[0]) && ! in_array($kind, ['IHDR', 'PLTE', 'IDAT', 'IEND'], true))) {
                Bytes::fail('MALFORMED_IMAGE', 'Unsupported critical PNG chunk');
            }
            $offset += 12 + $length;
            if ($kind === 'IEND') {
                $foundEnd = $length === 0 && $foundData && $offset === $len;
                break;
            }
        }
        if (! $foundEnd) {
            Bytes::fail('MALFORMED_IMAGE', 'PNG is truncated or missing its end chunk');
        }
    }
}
