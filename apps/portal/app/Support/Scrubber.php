<?php

namespace App\Support;

use Throwable;

/**
 * X-14 / NFR-S3: removes secrets, tokens and signed URLs from anything about to be logged (and,
 * from the Audit story on, from audit payloads). Pure and idempotent.
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

    public static function scrubString(string $value): string
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

        return (string) preg_replace_callback(self::EMAIL, fn (array $m): string => $m[1].'***@'.$m[2], $value);
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
