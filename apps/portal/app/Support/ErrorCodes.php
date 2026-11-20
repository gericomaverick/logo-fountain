<?php

namespace App\Support;

/**
 * The fixed list of API error codes (architecture §4.2, §6), mirrored by resources/js/lib/errors.ts.
 * One constant per line, sorted, value = name, so parallel stories merge cleanly.
 */
final class ErrorCodes
{
    public const AUTH_FAILED = 'AUTH_FAILED';

    public const AUTH_UNAVAILABLE = 'AUTH_UNAVAILABLE';

    public const FORBIDDEN = 'FORBIDDEN';

    public const INVALID_JSON = 'INVALID_JSON';

    public const PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE';

    public const RATE_LIMITED = 'RATE_LIMITED';

    public const UNAUTHORIZED = 'UNAUTHORIZED';
}
