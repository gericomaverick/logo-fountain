<?php

namespace Tests\Support;

use RuntimeException;

/**
 * The golden upload corpus (story 0.6a, X-12): `tests/parity/fixtures/uploads/manifest.json`, read in place through
 * the read-only mount in compose.yaml (x-php volumes), never copied. A missing directory fails the run; it never skips.
 *
 * The expected code is `laravelExpectedCode` when the manifest has one (DV-13, ZIP only), else `expectedCode`.
 * Files marked `generated` are not committed (generate.mjs builds them with node); the image ones are built here in
 * PHP, and checked against the manifest size and sha256 so they are byte-identical to Next's.
 */
final class UploadCorpus
{
    public const string DIR = '/var/www/parity-fixtures/uploads';

    /** @var array<string, string> generated image case id → temp file */
    private static array $built = [];

    /**
     * @return list<array{id: string, file: string, kind: string, filename: string, mime: string, code: ?string, branch: ?string, generated: bool, size: int, sha256: string}>
     */
    public static function cases(string $kind): array
    {
        $manifest = self::DIR.'/manifest.json';
        if (! is_file($manifest)) {
            throw new RuntimeException(
                "Upload corpus {$manifest} is missing. The app container must mount ../../tests/parity/fixtures/uploads read-only at "
                .self::DIR.' (apps/portal/compose.yaml, x-php volumes): recreate it with `docker compose up -d --force-recreate app`.'
            );
        }
        /** @var array{cases: list<array<string, mixed>>} $data */
        $data = json_decode((string) file_get_contents($manifest), true, flags: JSON_THROW_ON_ERROR);

        $out = [];
        foreach ($data['cases'] as $c) {
            if ($c['kind'] !== $kind) {
                continue;
            }
            $out[] = [
                'id' => (string) $c['id'],
                'file' => (string) $c['file'],
                'kind' => (string) $c['kind'],
                'filename' => (string) $c['filename'],
                'mime' => (string) $c['mime'],
                'code' => ($c['laravelExpectedCode'] ?? $c['expectedCode']) === null ? null : (string) ($c['laravelExpectedCode'] ?? $c['expectedCode']),
                'branch' => isset($c['branch']) ? (string) $c['branch'] : null,
                'generated' => (bool) $c['generated'],
                'size' => (int) $c['size'],
                'sha256' => (string) $c['sha256'],
            ];
        }

        return $out;
    }

    /** One Pest dataset row per case, named by id. @return array<string, array{0: array<string, mixed>}> */
    public static function dataset(string $kind): array
    {
        $rows = [];
        foreach (self::cases($kind) as $case) {
            $rows[$case['id']] = [$case];
        }

        return $rows;
    }

    /** A readable path to the case's bytes: the committed file, or (generated images) a temp file built here. */
    public static function path(array $case): string
    {
        if (! $case['generated']) {
            return self::DIR.'/'.$case['file'];
        }

        return self::$built[$case['file']] ??= str_starts_with($case['file'], '.generated/image-')
            ? self::buildGeneratedImage($case)
            : self::buildGeneratedZip($case);
    }

    /**
     * The generated ZIP cases (generate.mjs zipOfSize / zipTotalOverLimit). `zip-95000000` is built in full and checked
     * against the manifest sha256. The three over-limit size cases are sparse files of the manifest size (rejected from
     * the declared size before any read). The bomb is 6 entries x 100 MiB of the generator's block, deflated by zlib
     * (not byte-identical to Next's fixed-Huffman stream; same intent: ratio < 100 per entry, total over 500 MiB).
     */
    private static function buildGeneratedZip(array $case): string
    {
        $path = tempnam(sys_get_temp_dir(), 'corpus-');
        register_shutdown_function(static fn () => @unlink($path));
        $f = fopen($path, 'wb');
        $zeros = str_repeat("\0", 1 << 20);
        $header = static fn (string $name, int $crc, int $csize, int $size, int $method): string => pack('VvvvvvVVVvv', 0x04034B50, 20, 0, $method, 0, 0x21, $crc, $csize, $size, strlen($name), 0).$name;
        $central = static fn (string $name, int $crc, int $csize, int $size, int $method, int $offset): string => pack('VvvvvvvVVVvvvvvVV', 0x02014B50, 0x031E, 20, 0, $method, 0, 0x21, $crc, $csize, $size, strlen($name), 0, 0, 0, 0, (0100644 << 16) & 0xFFFFFFFF, $offset).$name;
        $eocd = static fn (int $n, int $cdSize, int $cdOffset): string => pack('VvvvvVVv', 0x06054B50, 0, 0, $n, $n, $cdSize, $cdOffset, 0);

        if ($case['id'] === 'zip-total-expanded-over-500mib') {
            $block = '';
            $r = 11;
            for ($i = 0; $i < 160; $i++) {
                $r = ($r * 1103515245 + 12345) & 0x7FFFFFFF;
                $block .= chr(1 + ($r >> 8) % 255);
            }
            $block .= str_repeat("\0", 25_000);
            $size = 100 * 1024 * 1024;
            $deflate = deflate_init(ZLIB_ENCODING_RAW, ['level' => 9]);
            $crc = hash_init('crc32b');
            $payload = '';
            for ($o = 0; $o < $size; $o += strlen($block)) {
                $piece = substr($block, 0, min(strlen($block), $size - $o));
                hash_update($crc, $piece);
                $payload .= deflate_add($deflate, $piece, ZLIB_NO_FLUSH);
            }
            $payload .= deflate_add($deflate, '', ZLIB_FINISH);
            $crcInt = (int) hexdec(hash_final($crc));
            $offset = 0;
            $cd = '';
            for ($i = 1; $i <= 6; $i++) {
                $name = "part-{$i}.bin";
                $h = $header($name, $crcInt, strlen($payload), $size, 8);
                fwrite($f, $h.$payload);
                $cd .= $central($name, $crcInt, strlen($payload), $size, 8, $offset);
                $offset += strlen($h) + strlen($payload);
            }
            fwrite($f, $cd.$eocd(6, strlen($cd), $offset));
            fclose($f);

            return $path;
        }

        $name = 'artwork.bin';
        $dataLength = $case['size'] - (30 + 46 + 22 + 2 * strlen($name));
        $crc = hash_init('crc32b');
        for ($left = $dataLength; $left > 0; $left -= strlen($zeros)) {
            hash_update($crc, $left >= strlen($zeros) ? $zeros : substr($zeros, 0, $left));
        }
        $crcInt = (int) hexdec(hash_final($crc));
        $h = $header($name, $crcInt, $dataLength, $dataLength, 0);
        $cd = $central($name, $crcInt, $dataLength, $dataLength, 0, 0);
        fwrite($f, $h);
        if ($case['code'] === null) {
            for ($left = $dataLength; $left > 0; $left -= strlen($zeros)) {
                fwrite($f, $left >= strlen($zeros) ? $zeros : substr($zeros, 0, $left));
            }
        } else {
            ftruncate($f, strlen($h) + $dataLength);
            fseek($f, 0, SEEK_END);
        }
        fwrite($f, $cd.$eocd(1, strlen($cd), strlen($h) + $dataLength));
        fclose($f);
        if (filesize($path) !== $case['size']) {
            throw new RuntimeException("Generated corpus case {$case['id']} is not {$case['size']} bytes.");
        }
        if ($case['code'] === null && hash_file('sha256', $path) !== $case['sha256']) {
            throw new RuntimeException("Generated corpus case {$case['id']} does not match the manifest sha256.");
        }

        return $path;
    }

    /** generate.mjs pngPadded(): the committed 8×8 RGBA PNG with a tEXt chunk of 'Comment\0' + 'x' padding before IEND. */
    private static function buildGeneratedImage(array $case): string
    {
        if (! str_starts_with($case['file'], '.generated/image-')) {
            throw new RuntimeException("UploadCorpus builds only the generated image cases, not {$case['id']}.");
        }
        $base = (string) file_get_contents(self::DIR.'/image/png-rgba-8bit.png');
        $textLength = $case['size'] - strlen($base) - 12;
        $textLength = $case['size'] - strlen($base) - 12;
        // Streamed in 1 MiB pieces (sha256 and the PNG CRC are incremental), so the 10 MiB body is never held whole.
        $path = tempnam(sys_get_temp_dir(), 'corpus-');
        register_shutdown_function(static fn () => @unlink($path));
        $f = fopen($path, 'wb');
        $sha = hash_init('sha256');
        $crc = hash_init('crc32b');
        $write = static function (string $piece) use ($f, $sha): void {
            fwrite($f, $piece);
            hash_update($sha, $piece);
        };
        $write(substr($base, 0, -12));
        $write(pack('N', $textLength).'tEXt');
        hash_update($crc, 'tEXt');
        $remaining = $textLength;
        $first = true;
        while ($remaining > 0) {
            $piece = $first ? "Comment\0" : '';
            $first = false;
            $piece .= str_repeat('x', min($remaining - strlen($piece), 1048576 - strlen($piece)));
            $remaining -= strlen($piece);
            $write($piece);
            hash_update($crc, $piece);
        }
        $write((string) hex2bin(hash_final($crc)));
        $write(substr($base, -12));
        fclose($f);

        if (filesize($path) !== $case['size'] || hash_final($sha) !== $case['sha256']) {
            throw new RuntimeException("Generated corpus case {$case['id']} does not match the manifest size/sha256.");
        }

        return $path;
    }
}
