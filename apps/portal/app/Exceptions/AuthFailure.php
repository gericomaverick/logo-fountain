<?php

namespace App\Exceptions;

use App\Http\Middleware\AuthJsonBoundary;
use App\Support\ErrorCodes;
use Illuminate\Contracts\Debug\ShouldntReport;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Port of apps/web/src/lib/auth/errors.ts. Thrown inside an auth endpoint, it renders the generic
 * auth failure with its own status and code (A-17), e.g. `new AuthFailure(401, 'UNAUTHORIZED')`.
 */
class AuthFailure extends RuntimeException implements ShouldntReport
{
    public function __construct(
        public readonly int $status = 400,
        public readonly string $errorCode = ErrorCodes::AUTH_FAILED,
    ) {
        parent::__construct(AuthJsonBoundary::GENERIC_MESSAGE);
    }

    public function render(): JsonResponse
    {
        return AuthJsonBoundary::failure($this->status, $this->errorCode);
    }
}
