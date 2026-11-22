<?php

namespace App\Support\Uploads\Image;

/** validateJpeg (upload-validation.ts:98-134), check order preserved. */
final class JpegValidator
{
    public static function validate(string $b): void
    {
        $len = strlen($b);
        if ($len < 4 || ord($b[0]) !== 0xFF || ord($b[1]) !== 0xD8) {
            Bytes::fail('FILE_SIGNATURE_MISMATCH', 'Not a JPEG');
        }
        $offset = 2;
        $frames = 0;
        $scans = 0;
        while ($offset < $len) {
            if (ord($b[$offset++]) !== 0xFF) {
                Bytes::fail('MALFORMED_IMAGE', 'Malformed JPEG marker');
            }
            while (Bytes::at($b, $offset) === 0xFF) {
                $offset++;
            }
            $marker = Bytes::at($b, $offset++);
            if ($marker === 0xD9) {
                if ($offset !== $len || $frames !== 1 || $scans === 0) {
                    Bytes::fail('MALFORMED_IMAGE', 'Incomplete JPEG');
                }

                return;
            }
            if ($marker === null || $marker === 0 || $marker === 0xD8 || ($marker >= 0xD0 && $marker <= 0xD7)) {
                Bytes::fail('MALFORMED_IMAGE', 'Unexpected JPEG marker');
            }
            if ($marker === 0x01) {
                continue;
            }
            if ($offset + 2 > $len) {
                Bytes::fail('MALFORMED_IMAGE', 'Truncated JPEG segment');
            }
            $length = (ord($b[$offset]) << 8) | ord($b[$offset + 1]);
            if ($length < 2 || $offset + $length > $len) {
                Bytes::fail('MALFORMED_IMAGE', 'Invalid JPEG segment size');
            }
            $frame = $marker >= 0xC0 && $marker <= 0xCF && ! in_array($marker, [0xC4, 0xC8, 0xCC], true);
            if ($frame) {
                $components = Bytes::at($b, $offset + 7) ?? 0;
                if (! in_array($marker, [0xC0, 0xC1, 0xC2], true) || ++$frames !== 1 || $length < 8
                    || $components === 0 || $components > 4 || $length !== 8 + 3 * $components) {
                    Bytes::fail('MALFORMED_IMAGE', 'Unsupported or duplicate JPEG frame');
                }
                Bytes::assertDimensions((ord($b[$offset + 5]) << 8) | ord($b[$offset + 6]), (ord($b[$offset + 3]) << 8) | ord($b[$offset + 4]));
            }
            if ($marker === 0xDC) {
                Bytes::fail('MALFORMED_IMAGE', 'JPEG deferred dimensions unsupported');
            }
            if ($marker === 0xDA) {
                $sosComponents = Bytes::at($b, $offset + 2) ?? 0;
                if ($frames !== 1 || $length < 6 || $sosComponents === 0 || $length !== 6 + 2 * $sosComponents) {
                    Bytes::fail('MALFORMED_IMAGE', 'Invalid JPEG scan');
                }
                $scans++;
                $offset += $length;
                $start = $offset;
                while ($offset < $len) {
                    if (ord($b[$offset]) !== 0xFF) {
                        $offset++;

                        continue;
                    }
                    $next = Bytes::at($b, $offset + 1);
                    if ($next === 0 || ($next !== null && $next >= 0xD0 && $next <= 0xD7)) {
                        $offset += 2;

                        continue;
                    }
                    break;
                }
                if ($offset === $start) {
                    Bytes::fail('MALFORMED_IMAGE', 'Empty JPEG scan');
                }
            } else {
                $offset += $length;
            }
        }
        Bytes::fail('MALFORMED_IMAGE', 'Missing JPEG end marker');
    }
}
