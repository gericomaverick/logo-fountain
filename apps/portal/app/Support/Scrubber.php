<?php

namespace App\Support;

use stdClass;
use Throwable;

/**
 * X-14 / NFR-S3: removes secrets, tokens and signed URLs from anything about to be logged, and
 * (story 2.4, through scrubAuditPayload()) from audit payloads. Pure and idempotent.
 *
 * - Values under a sensitive key (password, token, secret, cookie, authorization, signature,
 *   api key, session id, ...) become "[REDACTED]".
 * - In strings: Bearer/Basic credentials, Stripe secret, restricted and webhook keys, Stripe
 *   checkout session ids (a possession token for /api/checkout/magic-link), JWTs, and the query
 *   and fragment of any URL that carries a token or signature (presigned R2/S3 URLs, Laravel
 *   signed URLs, auth links `#token=…`).
 *
 * - Email addresses keep their first character and domain (`c***@parity.test`).
 * - Throwables become a scrubbed {class, message, code, file, trace (no args), previous} array.
 *
 * The audit profile (scrubAuditPayload) applies the same key and string rules, also inside objects, except:
 * emails are not masked (owner, story 2.4 OQ 1), and a top-level string `checkoutSessionId` is kept verbatim
 * (owner, 2026-11-21: Next stores it and the admin audit endpoint returns it). Logs keep redacting both.
 */
final class Scrubber
{
    public const REDACTED = '[REDACTED]';

    private const MAX_DEPTH = 12;

    /** Matched against the key lowercased with `_`, `-` and spaces removed. */
    private const SENSITIVE_KEY = '/(pass(word|wd|phrase)?$|password|secret|token|authorization|cookie|signature|apikey|privatekey|credential|sessionid|^session$|^sig$|^otp$)/';

    /** URL parameters whose presence makes the whole query and fragment sensitive. */
    private const SENSITIVE_PARAM = '(?:[a-z_]*token|signature|sig|x-amz-[a-z-]+|x-goog-[a-z-]+|session_id|code|password|secret|key|api_key|apikey|auth)';

    /** @var array<string, string> pattern => replacement, applied in order */
    private const PATTERNS = [
        // Authorization header values.
        '/\b(Bearer)\s+[A-Za-z0-9._~+\/=-]{8,}/i' => '$1 '.self::REDACTED,
        // Basic credentials: base64 with a digit, "+", "/" or "=" (so "Basic information" is kept).
        '/\b(Basic)\s+(?=[A-Za-z0-9+\/]*[0-9+\/=])[A-Za-z0-9+\/]{8,}={0,2}/' => '$1 '.self::REDACTED,
        // Stripe secret / restricted / webhook keys and checkout session ids.
        '/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/' => self::REDACTED,
        '/\bwhsec_[A-Za-z0-9+\/=]+/' => self::REDACTED,
        '/\bcs_(?:live|test)_[A-Za-z0-9]+/' => self::REDACTED,
        // JWT / JWS (also Laravel's encrypted cookie payloads start with eyJ).
        '/\beyJ[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]+){0,2}/' => self::REDACTED,
        // A sensitive parameter outside a full URL (e.g. "/auth/callback#token=abc&next=/x").
        '/([?&#;]\s*'.self::SENSITIVE_PARAM.'=)[^&#\s"\'<>]*/i' => '$1'.self::REDACTED,
    ];

    private const URL = '~\bhttps?://[^\s"\'<>]+~i';

    private const EMAIL = '/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/';

    /** Top-level audit payload keys whose string value is stored verbatim (story 2.4, owner decision). */
    public const AUDIT_KEPT_KEYS = ['checkoutSessionId'];

    public static function scrub(mixed $value, int $depth = 0): mixed
    {
        if (is_string($value)) {
            return self::scrubString($value);
        }
        if ($value instanceof Throwable) {
            return self::scrubThrowable($value, $depth);
        }
        if (! is_array($value)) {
            return $value;
        }
        if ($depth >= self::MAX_DEPTH) {
            return self::REDACTED;
        }

        $out = [];
        foreach ($value as $key => $item) {
            $out[$key] = is_string($key) && self::isSensitiveKey($key) && $item !== null && $item !== ''
                ? self::REDACTED
                : self::scrub($item, $depth + 1);
        }

        return $out;
    }

    /**
     * The audit profile (story 2.4): the log rules applied to arrays and stdClass trees (as decoded from JSON),
     * without email masking, keeping a top-level string `checkoutSessionId`. Objects keep their type, so an
     * empty object stays `{}`.
     *
     * @template T of array<array-key, mixed>|stdClass
     *
     * @param  T  $payload
     * @return T
     */
    public static function scrubAuditPayload(array|stdClass $payload): array|stdClass
    {
        /** @var T */
        return self::scrubAudit($payload, 0);
    }

    public static function scrubString(string $value): string
    {
        return self::scrubText($value, true);
    }

    private static function scrubAudit(mixed $value, int $depth): mixed
    {
        if (is_string($value)) {
            return self::scrubText($value, false);
        }
        $isObject = $value instanceof stdClass;
        if (! $isObject && ! is_array($value)) {
            return $value;
        }
        if ($depth >= self::MAX_DEPTH) {
            return self::REDACTED;
        }

        $out = [];
        foreach ((array) $value as $key => $item) {
            if ($depth === 0 && is_string($item) && in_array($key, self::AUDIT_KEPT_KEYS, true)) {
                $out[$key] = $item;

                continue;
            }
            $out[$key] = is_string($key) && self::isSensitiveKey($key) && $item !== null && $item !== ''
                ? self::REDACTED
                : self::scrubAudit($item, $depth + 1);
        }

        return $isObject ? (object) $out : $out;
    }

    private static function scrubText(string $value, bool $maskEmails): string
    {
        // Whole query and fragment of a URL that carries a credential: everything after "?" or "#".
        $value = (string) preg_replace_callback(self::URL, function (array $m): string {
            $url = $m[0];
            $cut = strcspn($url, '?#');
            if ($cut === strlen($url)) {
                return $url;
            }
            $rest = substr($url, $cut);

            return preg_match('/(?:^|[?&#;])'.self::SENSITIVE_PARAM.'=/i', $rest) === 1
                ? substr($url, 0, $cut).$url[$cut].self::REDACTED
                : $url;
        }, $value);

        foreach (self::PATTERNS as $pattern => $replacement) {
            $value = (string) preg_replace($pattern, $replacement, $value);
        }

        return $maskEmails
            ? (string) preg_replace_callback(self::EMAIL, fn (array $m): string => $m[1].'***@'.$m[2], $value)
            : $value;
    }

    public static function isSensitiveKey(string $key): bool
    {
        $normalised = strtolower((string) preg_replace('/[\s_-]+/', '', $key));

        return preg_match(self::SENSITIVE_KEY, $normalised) === 1;
    }

    /** @return array<string, mixed> */
    private static function scrubThrowable(Throwable $e, int $depth): array
    {
        $out = [
            'class' => $e::class,
            'message' => self::scrubString($e->getMessage()),
            'code' => $e->getCode(),
            'file' => $e->getFile().':'.$e->getLine(),
            // Frames without arguments (arguments can hold credentials).
            'trace' => array_map(
                fn (array $f): string => ($f['file'] ?? '[internal]').':'.($f['line'] ?? 0).' '.($f['class'] ?? '').($f['type'] ?? '').$f['function'],
                array_slice($e->getTrace(), 0, 30),
            ),
        ];
        $previous = $e->getPrevious();
        if ($previous !== null && $depth < self::MAX_DEPTH) {
            $out['previous'] = self::scrubThrowable($previous, $depth + 1);
        }

        return $out;
    }
}
