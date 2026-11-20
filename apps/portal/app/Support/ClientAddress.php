<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * The client address taken ONLY from the explicit proxy configuration; null means unknown.
 * Minimal port of `trustedClientAddress` (`apps/web/src/lib/auth/client-address.ts:15-29`) so that
 * production auth can fail closed (A-17). Story 1.5 (X-05) ports the full case table and owns the
 * TrustedClientAddress middleware.
 */
final class ClientAddress
{
    public static function trusted(Request $request, ?AuthProxyConfig $config): ?string
    {
        if ($config === null) {
            return null;
        }
        if ($config->header !== null) {
            // A list means the proxy appended instead of overwriting: unknown.
            return self::ip(trim(self::joined($request, $config->header)));
        }
        $hops = $config->hops ?? 0;
        $chain = array_map(trim(...), explode(',', self::joined($request, 'x-forwarded-for')));
        $count = count($chain);

        return $hops >= 1 && $count >= $hops ? self::ip($chain[$count - $hops]) : null;
    }

    /** Repeated headers joined with ", " as the Fetch `Headers.get` does. */
    private static function joined(Request $request, string $name): string
    {
        return implode(', ', array_filter($request->headers->all($name), is_string(...)));
    }

    private static function ip(string $value): ?string
    {
        return filter_var($value, FILTER_VALIDATE_IP) === false ? null : $value;
    }
}
