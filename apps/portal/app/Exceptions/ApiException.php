<?php

namespace App\Exceptions;

use App\Support\ApiError;
use Illuminate\Contracts\Debug\ShouldntReport;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * A domain or route error with an HTTP status and an ErrorCodes code: the Laravel form of Next's
 * RouteAuthError + toRouteErrorResponse (lib/auth/require.ts). Laravel calls render(), so every
 * throw becomes the X-03 envelope. These are expected outcomes, so they are never logged.
 */
class ApiException extends RuntimeException implements ShouldntReport
{
    /** @param  array<string, mixed>|null  $details */
    public function __construct(
        string $message,
        public readonly int $status,
        public readonly ?string $errorCode = null,
        public readonly ?array $details = null,
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return ApiError::response($this->getMessage(), $this->status, $this->details, $this->errorCode);
    }
}
