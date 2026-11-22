<?php

namespace App\Support\Uploads;

use App\Support\Uploads\Image\JpegValidator;
use App\Support\Uploads\Image\PngValidator;
use App\Support\Uploads\Image\WebpValidator;

/**
 * Port of prepareConceptImage (apps/web/src/lib/upload-validation.ts:170-184): size, then extension + the
 * CLIENT-supplied MIME (never sniffed), then the bytes, then the structure. No image library (a decoder
 * would accept files this validator rejects).
 */
final class ConceptImageValidator
{
    public const int MAX_BYTES = 10 * 1024 * 1024;

    private const array ALLOWED = [
        'png' => ['image/png', 'png'],
        'jpg' => ['image/jpeg', 'jpg'],
        'jpeg' => ['image/jpeg', 'jpg'],
        'webp' => ['image/webp', 'webp'],
    ];

    /**
     * @param  string  $path  the temp file ($file->getRealPath())
     * @param  string  $clientName  $file->getClientOriginalName()
     * @param  string|null  $clientMime  $file->getClientMimeType(), not getMimeType() (which sniffs)
     * @param  int  $declaredSize  $file->getSize(); checked before any byte is read
     */
    public function prepare(string $path, string $clientName, ?string $clientMime, int $declaredSize): PreparedUpload
    {
        if ($declaredSize <= 0) {
            throw new UploadValidationException('FILE_REQUIRED', 'Concept image is empty');
        }
        if ($declaredSize > self::MAX_BYTES) {
            throw new UploadValidationException('FILE_TOO_LARGE', 'Concept image exceeds the 10 MB limit');
        }

        $dot = strrpos($clientName, '.');
        $extension = $dot === false ? '' : mb_strtolower(substr($clientName, $dot + 1));
        $expected = self::ALLOWED[$extension] ?? null;
        if ($expected === null || $clientMime !== $expected[0]) {
            throw new UploadValidationException('INVALID_FILE_TYPE', 'Use a PNG, JPEG, or WebP image with matching file extension and MIME type');
        }

        $bytes = file_get_contents($path);
        if ($bytes === false) {
            throw new \RuntimeException("Cannot read the uploaded file at {$path}");
        }

        match ($expected[1]) {
            'png' => PngValidator::validate($bytes),
            'jpg' => JpegValidator::validate($bytes),
            default => WebpValidator::validate($bytes),
        };

        return new PreparedUpload($path, $expected[1], $expected[0], strlen($bytes));
    }
}
