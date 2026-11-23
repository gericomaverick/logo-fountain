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
    /** 500: Stripe refused or failed to create the Checkout Session (K-01, `checkout/start/route.ts:67-70`). */
    public const CHECKOUT_SESSION_FAILED = 'CHECKOUT_SESSION_FAILED';

    /** 500: Stripe returned a session with no hosted URL (K-01, `checkout/start/route.ts:64`). */
    public const CHECKOUT_URL_MISSING = 'CHECKOUT_URL_MISSING';

    public const CONCEPT_NOT_FOUND = 'CONCEPT_NOT_FOUND';

    public const FORBIDDEN = 'FORBIDDEN';

    /** 400: every failed sign-in (A-01, `login/route.ts:7`). */
    public const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';

    /** 400: forgot-password without a plausible address (`forgot-password/route.ts:9`). */
    public const INVALID_EMAIL = 'INVALID_EMAIL';

    public const INVALID_KIND = 'INVALID_KIND';

    public const INVALID_ADDON_KEY = 'INVALID_ADDON_KEY';

    public const INVALID_UPGRADE_PATH = 'INVALID_UPGRADE_PATH';

    public const UNSUPPORTED_UPGRADE_PATH = 'UNSUPPORTED_UPGRADE_PATH';

    public const PRICE_NOT_CONFIGURED = 'PRICE_NOT_CONFIGURED';

    public const INVALID_JSON = 'INVALID_JSON';

    /** Story 5.4 (K-02/K-03): checkout status and send-link. */
    /** Story 5.6 (K-12, DV-23): admin reprocess. */
    public const CHECKOUT_SESSION_NOT_FOUND = 'CHECKOUT_SESSION_NOT_FOUND';

    public const STRIPE_UNAVAILABLE = 'STRIPE_UNAVAILABLE';

    public const CHECKOUT_SESSION_NOT_PAID = 'CHECKOUT_SESSION_NOT_PAID';

    public const MISSING_SESSION_ID = 'MISSING_SESSION_ID';

    public const NOT_FULFILLED = 'NOT_FULFILLED';

    public const MISSING_EMAIL = 'MISSING_EMAIL';

    public const EMAIL_UNAVAILABLE = 'EMAIL_UNAVAILABLE';

    public const AUTH_EMAIL_SEND_FAILED = 'AUTH_EMAIL_SEND_FAILED';

    /** 403: a mutation without canonical Origin/Referer provenance (X-01, `lib/request-origin.ts:103`). */
    public const INVALID_ORIGIN = 'INVALID_ORIGIN';

    /** 400: `package_code` is not one of the allowlisted codes (K-01, `checkout/start/route.ts:20-24`). */
    public const INVALID_PACKAGE = 'INVALID_PACKAGE';

    public const PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE';

    /** 404: not a member of the project's client (`lib/auth/require.ts:49-61`); never a 403. */
    public const PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND';

    /** 503: the canonical origin can't be derived (X-04, `lib/request-origin.ts:97`). */
    public const PUBLIC_SITE_URL_REQUIRED = 'PUBLIC_SITE_URL_REQUIRED';

    public const RATE_LIMITED = 'RATE_LIMITED';

    public const UNAUTHORIZED = 'UNAUTHORIZED';

    public const WEAK_PASSWORD = 'WEAK_PASSWORD';

    public const SESSION_VERIFICATION_UNAVAILABLE = 'SESSION_VERIFICATION_UNAVAILABLE';
}
