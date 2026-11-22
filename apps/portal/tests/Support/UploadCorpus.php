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

        return self::$built[$case['file']] ??= self::buildGeneratedImage($case);
    }

    /** generate.mjs pngPadded(): the committed 8×8 RGBA PNG with a tEXt chunk of 'Comment\0' + 'x' padding before IEND. */
    private static function buildGeneratedImage(array $case): string
    {
        if (! str_starts_with($case['file'], '.generated/image-')) {
            throw new RuntimeException("UploadCorpus builds only the generated image cases, not {$case['id']}.");
        }
        $base = (string) file_get_contents(self::DIR.'/image/png-rgba-8bit.png');
        $textLength = $case['size'] - strlen($base) - 12;
        $text = "Comment\0".str_repeat('x', $textLength - 8);
        $chunk = pack('N', strlen($text)).'tEXt'.$text.pack('N', crc32('tEXt'.$text));
        $bytes = substr($base, 0, -12).$chunk.substr($base, -12);

        if (strlen($bytes) !== $case['size'] || hash('sha256', $bytes) !== $case['sha256']) {
            throw new RuntimeException("Generated corpus case {$case['id']} does not match the manifest size/sha256.");
        }
        $path = tempnam(sys_get_temp_dir(), 'corpus-');
        file_put_contents($path, $bytes);
        register_shutdown_function(static fn () => @unlink($path));

        return $path;
    }
}
