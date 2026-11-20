<?php

namespace App\Support;

/**
 * Exact PHP equivalents of the Node/JS primitives the auth proxy rules are written with (story 1.5,
 * X-05). Checked against fixtures recorded from Node 24 (`tests/Fixtures/node-net/`).
 */
final class NodeCompat
{
    private const V4_SEG = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])';

    private const V6_SEG = '(?:[0-9a-fA-F]{1,4})';

    /** Latin1 bytes that `String.prototype.trim` strips: TAB, LF, VT, FF, CR, SPACE, NBSP. */
    private const LATIN1_SPACE = "\t\n\x0B\x0C\r \xA0";

    /** Every code point `String.prototype.trim` strips (`tests/Fixtures/node-net/trim.json`). */
    private const UNICODE_SPACE = '[\x{9}-\x{D}\x{20}\x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]';

    private static ?string $ipv4 = null;

    private static ?string $ipv6 = null;

    /**
     * `net.isIP(s) !== 0` (`lib/internal/net.js`, Node 24): no leading zeros in IPv4, IPv6 with an
     * optional embedded IPv4 tail and an optional zone ID (`fe80::1%eth0`). Unlike
     * `filter_var(FILTER_VALIDATE_IP)`, which rejects zone IDs. `/D`: JS `$` never matches before "\n".
     */
    public static function isIp(string $value): bool
    {
        return preg_match(self::ipv4Pattern(), $value) === 1 || preg_match(self::ipv6Pattern(), $value) === 1;
    }

    /** `trim()` of a header value, which Node decodes as latin1 (one char per byte). */
    public static function trimHeader(string $value): string
    {
        return trim($value, self::LATIN1_SPACE);
    }

    /**
     * `trim()` of an environment value, which Node decodes as UTF-8. Invalid UTF-8 is trimmed of
     * ASCII whitespace only: Node turns the bad bytes into U+FFFD, which no rule here accepts.
     */
    public static function trimEnv(string $value): string
    {
        if (! mb_check_encoding($value, 'UTF-8')) {
            return trim($value, "\t\n\x0B\x0C\r ");
        }

        return (string) preg_replace('/^'.self::UNICODE_SPACE.'+|'.self::UNICODE_SPACE.'+$/uD', '', $value);
    }

    /** `toLowerCase()` of a UTF-8 string (full Unicode mapping, e.g. U+212A KELVIN SIGN → "k"). */
    public static function lower(string $value): string
    {
        return mb_check_encoding($value, 'UTF-8') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    }

    private static function ipv4Pattern(): string
    {
        return self::$ipv4 ??= '/^'.self::v4().'$/D';
    }

    private static function ipv6Pattern(): string
    {
        if (self::$ipv6 !== null) {
            return self::$ipv6;
        }
        $s = self::V6_SEG;
        $v4 = self::v4();

        return self::$ipv6 = '/^(?:'.
            "(?:{$s}:){7}(?:{$s}|:)|".
            "(?:{$s}:){6}(?:{$v4}|:{$s}|:)|".
            "(?:{$s}:){5}(?::{$v4}|(?::{$s}){1,2}|:)|".
            "(?:{$s}:){4}(?:(?::{$s}){0,1}:{$v4}|(?::{$s}){1,3}|:)|".
            "(?:{$s}:){3}(?:(?::{$s}){0,2}:{$v4}|(?::{$s}){1,4}|:)|".
            "(?:{$s}:){2}(?:(?::{$s}){0,3}:{$v4}|(?::{$s}){1,5}|:)|".
            "(?:{$s}:){1}(?:(?::{$s}){0,4}:{$v4}|(?::{$s}){1,6}|:)|".
            "(?::(?:(?::{$s}){0,5}:{$v4}|(?::{$s}){1,7}|:))".
            ')(?:%[0-9a-zA-Z.:\-]{1,})?$/D';
    }

    private static function v4(): string
    {
        return '(?:'.self::V4_SEG.'\.){3}'.self::V4_SEG;
    }
}
