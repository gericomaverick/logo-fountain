<?php

namespace App\Http\Middleware;

use App\Support\AuthProxyConfig;
use App\Support\ClientAddress;
use App\Support\ErrorCodes;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A-17 production fail-closed, `authProxyUnavailable` in `apps/web/src/lib/auth/http.ts:14-17`:
 * in production every auth endpoint answers 503 AUTH_UNAVAILABLE unless a trusted client address
 * can be derived for THIS request (invalid proxy config, or a missing/malformed value).
 *
 * Order (auth/http.ts:18-22): this runs BEFORE RequireCanonicalOrigin on auth mutations; logout
 * reverses it (origin first). Referrer-Policy is left to story 1.6 (the global header wins on the wire).
 */
final class EnsureAuthAvailable
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! app()->isProduction() || ClientAddress::trusted($request, AuthProxyConfig::fromConfig()) !== null) {
            return $next($request);
        }

        return response()->json(
            ['error' => ['code' => ErrorCodes::AUTH_UNAVAILABLE, 'message' => 'Authentication is temporarily unavailable.']],
            503,
            ['Cache-Control' => 'no-store'],
        );
    }
}
