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

    /** 404 (400 on revision requests): a concept that doesn't exist or isn't client-visible (DV-7, ADR-020). */
    public const CONCEPT_NOT_FOUND = 'CONCEPT_NOT_FOUND';

    public const FORBIDDEN = 'FORBIDDEN';

    public const INVALID_JSON = 'INVALID_JSON';

    /** 403: a mutation without canonical Origin/Referer provenance (X-01, `lib/request-origin.ts:103`). */
    public const INVALID_ORIGIN = 'INVALID_ORIGIN';

    public const PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE';

    /** 404: not a member of the project's client (`lib/auth/require.ts:49-61`); never a 403. */
    public const PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND';

    /** 503: the canonical origin can't be derived (X-04, `lib/request-origin.ts:97`). */
    public const PUBLIC_SITE_URL_REQUIRED = 'PUBLIC_SITE_URL_REQUIRED';

    public const RATE_LIMITED = 'RATE_LIMITED';

    public const UNAUTHORIZED = 'UNAUTHORIZED';
}
