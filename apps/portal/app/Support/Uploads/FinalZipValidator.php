<?php

namespace App\Support\Uploads;

use App\Support\Uploads\Zip\ZipFile;
use App\Support\Uploads\Zip\ZipStructure;

/**
 * Port of prepareFinalZip (apps/web/src/lib/upload-validation.ts:186-193) with the DV-13 cap of 95,000,000 bytes
 * (Next: 100 MiB). Size from the declared size before any byte is read; extension + CLIENT MIME; PK\x03\x04;
 * then ZipStructure (zip-validation.ts) on ranged reads. Never ZipArchive (arch test).
 */
final class FinalZipValidator
{
    public const int MAX_BYTES = 95_000_000;

    /**
     * @param  string|null  $clientMime  $file->getClientMimeType(), not getMimeType()
     */
    public function prepare(string $path, string $clientName, ?string $clientMime, int $declaredSize): PreparedUpload
    {
        if ($declaredSize <= 0) {
            throw new UploadValidationException('FILE_REQUIRED', 'Final ZIP is empty');
        }
        if ($declaredSize > self::MAX_BYTES) {
            throw new UploadValidationException('FILE_TOO_LARGE', 'Final ZIP exceeds the 95 MB limit');
        }

        $dot = strrpos($clientName, '.');
        $extension = $dot === false ? '' : mb_strtolower(substr($clientName, $dot + 1));
        if ($extension !== 'zip' || ! in_array($clientMime, ['application/zip', 'application/x-zip-compressed'], true)) {
            throw new UploadValidationException('INVALID_FILE_TYPE', 'Use a .zip file with an allowed ZIP MIME type');
        }

        $zip = new ZipFile($path, $declaredSize);
        if ($declaredSize < 4 || $zip->u32(0) !== 0x04034B50) {
            throw new UploadValidationException('FILE_SIGNATURE_MISMATCH', 'File is not a standard ZIP archive');
        }
        ZipStructure::validate($zip);

        return new PreparedUpload($path, 'zip', 'application/zip', $declaredSize);
    }
}
