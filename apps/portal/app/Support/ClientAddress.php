<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * X-05 / ADR-010: the client address, taken ONLY from the explicit proxy configuration (a header
 * the trusted proxy overwrites, or N trusted hops appending to X-Forwarded-For). Null = unknown:
 * per-address rate limits are skipped and, in production, auth answers 503 AUTH_UNAVAILABLE.
 * Full port of `trustedClientAddress` (`apps/web/src/lib/auth/client-address.ts:15-29`), story 1.5.
 *
 * Never use `$request->ip()` for this: the framework's TrustProxies is removed (bootstrap/app.php),
 * so `ip()` is only the socket peer (a Cloudflare edge in production).
 */
final class ClientAddress
{
    /** Request attribute set once per request by `TrustedClientAddress`. */
    public const ATTRIBUTE = 'portal.client_address';

    /** The address for this request (memoised by the middleware; derived on demand otherwise). */
    public static function for(Request $request): ?string
    {
        if ($request->attributes->has(self::ATTRIBUTE)) {
            $value = $request->attributes->get(self::ATTRIBUTE);

            return is_string($value) ? $value : null;
        }

        return self::trusted($request, AuthProxyConfig::fromConfig());
    }

    public static function trusted(Request $request, ?AuthProxyConfig $config): ?string
    {
        if ($config === null) {
            // Forwarding headers are never read without configuration: a client can put anything in them.
            return null;
        }
        if ($config->header !== null) {
            // The proxy must overwrite with exactly one address; a list means it appended.
            return self::ip(NodeCompat::trimHeader(self::joined($request, $config->header) ?? ''));
        }
        $hops = $config->hops ?? 0;
        $chain = array_map(NodeCompat::trimHeader(...), explode(',', self::joined($request, 'x-forwarded-for') ?? ''));
        $count = count($chain);

        // Entries left of the one our outermost trusted proxy appended are client-chosen.
        return $hops >= 1 && $count >= $hops ? self::ip($chain[$count - $hops]) : null;
    }

    /** `Headers.get`: null when absent, repeated values joined with ", " (as Node and nginx do). */
    private static function joined(Request $request, string $name): ?string
    {
        if (! $request->headers->has($name)) {
            return null;
        }

        return implode(', ', array_map(strval(...), $request->headers->all($name)));
    }

    private static function ip(string $value): ?string
    {
        return NodeCompat::isIp($value) ? $value : null;
    }
}
