<?php

namespace App\Support;

/**
 * The fixed list of legacy API error codes (architecture §4.2), mirrored by resources/js/lib/errors.ts.
 * Values are byte-for-byte the Next.js codes; the parity contract tests assert on them.
 */
final class ErrorCodes
{
    /** 503: the canonical origin can't be derived (X-04, `lib/request-origin.ts:97`). */
    public const PUBLIC_SITE_URL_REQUIRED = 'PUBLIC_SITE_URL_REQUIRED';

    /** 503: production auth without a trusted client address (A-17, `lib/auth/http.ts:16`). */
    public const AUTH_UNAVAILABLE = 'AUTH_UNAVAILABLE';
}
