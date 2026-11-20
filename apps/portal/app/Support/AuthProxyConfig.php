<?php

namespace App\Support;

/**
 * A-17 / O-05 (ADR-010): which proxy-supplied value identifies the client.
 * Port of `configuredAuthProxy` (`apps/web/src/lib/auth/proxy-config.mjs:4-14`): exactly one of
 * AUTH_CLIENT_IP_HEADER (a header the proxy OVERWRITES) or AUTH_TRUSTED_PROXY_HOPS (1–99 proxies
 * appending to X-Forwarded-For). Both, neither or a malformed value → no configuration.
 */
final readonly class AuthProxyConfig
{
    private const FORBIDDEN_HEADERS = ['host', 'origin', 'referer', 'cookie', 'authorization'];

    public const PREFLIGHT_FAILURE = 'Auth proxy preflight failed: set exactly one valid AUTH_CLIENT_IP_HEADER or AUTH_TRUSTED_PROXY_HOPS';

    private function __construct(public ?string $header, public ?int $hops) {}

    public static function fromConfig(): ?self
    {
        return self::from(config('portal.auth_client_ip_header'), config('portal.auth_trusted_proxy_hops'));
    }

    public static function from(mixed $header, mixed $hops): ?self
    {
        $header = NodeCompat::lower(self::text($header));
        $hops = self::text($hops);
        if (($header !== '') === ($hops !== '')) {
            return null;
        }
        if ($header !== '') {
            return preg_match('/^[a-z][a-z0-9-]*$/D', $header) === 1 && ! in_array($header, self::FORBIDDEN_HEADERS, true)
                ? new self($header, null)
                : null;
        }

        return preg_match('/^[1-9][0-9]?$/D', $hops) === 1 ? new self(null, (int) $hops) : null;
    }

    private static function text(mixed $value): string
    {
        // `?.trim()` on a UTF-8 env value (story 1.5: JS trim, not PHP's).
        return is_string($value) || is_int($value) ? NodeCompat::trimEnv((string) $value) : '';
    }
}
