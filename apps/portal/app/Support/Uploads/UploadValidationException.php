<?php

namespace App\Support\Uploads;

use RuntimeException;

/**
 * A rejected upload: one code, one message, exactly as Next's UploadValidationError
 * (apps/web/src/lib/upload-validation.ts:18-23). The route (7.5a) renders it as 400 {error:{message, code}}.
 */
final class UploadValidationException extends RuntimeException
{
    public const array CODES = [
        'FILE_REQUIRED', 'FILE_TOO_LARGE', 'INVALID_FILE_TYPE', 'FILE_SIGNATURE_MISMATCH', 'MALFORMED_IMAGE',
        'IMAGE_DIMENSIONS_TOO_LARGE', 'MALFORMED_ZIP', 'ZIP_LIMIT_EXCEEDED',
    ];

    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}
