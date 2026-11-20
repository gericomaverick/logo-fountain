<?php

namespace App\Support;

/**
 * The fixed list of legacy API error codes (architecture §4.2, §6), mirrored by resources/js/lib/errors.ts.
 * Values are byte-for-byte the Next.js codes; the parity contract tests assert on them.
 * One constant per entry, sorted, value = name, so parallel stories merge cleanly.
 */
final class ErrorCodes
{
    public const AUTH_FAILED = 'AUTH_FAILED';

    /** 503: production auth without a trusted client address (A-17, `lib/auth/http.ts:16`). */
    public const AUTH_UNAVAILABLE = 'AUTH_UNAVAILABLE';

    public const FORBIDDEN = 'FORBIDDEN';

    public const INVALID_JSON = 'INVALID_JSON';

    public const PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE';

    /** 503: the canonical origin can't be derived (X-04, `lib/request-origin.ts:97`). */
    public const PUBLIC_SITE_URL_REQUIRED = 'PUBLIC_SITE_URL_REQUIRED';

    public const RATE_LIMITED = 'RATE_LIMITED';

    public const UNAUTHORIZED = 'UNAUTHORIZED';
}
