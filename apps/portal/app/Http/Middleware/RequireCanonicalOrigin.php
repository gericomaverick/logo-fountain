<?php

namespace App\Http\Middleware;

use App\Domain\CanonicalOrigin;
use App\Domain\PublicSiteUrlRequired;
use App\Support\ErrorCodes;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The mutation Origin guard (X-01, ADR-008), `rejectUntrustedMutationOrigin` in
 * `apps/web/src/lib/request-origin.ts:91-106`. Runs before session, auth and body parsing.
 *
 * Story 1.3: no canonical origin → 503 PUBLIC_SITE_URL_REQUIRED (no `no-store`, as in Next).
 * Story 1.4 adds the Origin/Referer provenance check (403 INVALID_ORIGIN), the exemptions and
 * the arch test, using the origin stored on the request here.
 */
final class RequireCanonicalOrigin
{
    public const ATTRIBUTE = 'canonical_origin';

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethodSafe()) {
            return $next($request);
        }

        try {
            $canonical = CanonicalOrigin::fromConfig()->resolve($request);
        } catch (PublicSiteUrlRequired) {
            return response()->json(
                ['error' => ['code' => ErrorCodes::PUBLIC_SITE_URL_REQUIRED, 'message' => 'Request validation is temporarily unavailable.']],
                503,
            );
        }
        $request->attributes->set(self::ATTRIBUTE, $canonical);

        return $next($request);
    }
}
