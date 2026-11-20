<?php

namespace App\Http\Middleware;

use App\Domain\CanonicalOrigin;
use App\Domain\PublicSiteUrlRequired;
use App\Exceptions\ApiException;
use App\Support\ErrorCodes;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The mutation Origin guard and the CSRF control for /api/* (X-01, ADR-008):
 * `rejectUntrustedMutationOrigin` in `apps/web/src/lib/request-origin.ts:59-106`.
 *
 * A global middleware, right after SecurityHeaders (bootstrap/app.php), so it runs before
 * TrimStrings/ConvertEmptyStringsToNull (body parsing), the session and auth. It guards every
 * request whose REAL method is not GET/HEAD/OPTIONS on a path under /api, except EXEMPT_PATHS.
 * Being path-based, a new /api route is guarded by default (tests/Arch/OriginGuardTest.php).
 *
 * 1. No canonical origin → 503 PUBLIC_SITE_URL_REQUIRED (story 1.3).
 * 2. Origin present (even "" or "null") → it must equal the canonical origin exactly; a Referer
 *    never rescues it. Origin absent → the Referer must start with `canonical/`, hold no control
 *    character or backslash, and carry no non-empty fragment.
 * 3. Otherwise 403 INVALID_ORIGIN. Neither error sends `no-store` (as in Next).
 */
final class RequireCanonicalOrigin
{
    public const ATTRIBUTE = 'canonical_origin';

    /** `MUTATION_ORIGIN_EXEMPTIONS`, apps/web/src/app/api/route-guards.test.ts:34-38. */
    public const EXEMPT_PATHS = [
        'api/stripe/webhook',              // Stripe signature authenticates the exact raw body.
        'api/checkout/magic-link',         // Public post-checkout possession-token flow; rate limited.
        'api/checkout/resend-magic-link',  // Public post-checkout possession-token flow; rate limited.
    ];

    /**
     * The `authMutation` endpoints (lib/auth/http.ts:18-22): the production proxy check
     * (EnsureAuthAvailable, 503 AUTH_UNAVAILABLE) runs BEFORE the origin guard. Logout is not here:
     * it checks the origin first (app/api/auth/logout/route.ts:6-9).
     */
    public const PROXY_FIRST_PATHS = [
        'api/auth/forgot-password',
        'api/auth/login',
        'api/auth/magic-link',
        'api/auth/magic-link/verify',
        'api/auth/password',
        'api/auth/reset-password',
    ];

    /** Next guards no GET; HEAD and OPTIONS are answered from (or alongside) GET. */
    public const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

    public const MESSAGE = 'Request origin is not allowed.';

    public function handle(Request $request, Closure $next): Response
    {
        if (! self::guards($request->getRealMethod(), self::routingPath($request))) {
            return $next($request);
        }
        if (in_array(self::routingPath($request), self::PROXY_FIRST_PATHS, true)) {
            return app(EnsureAuthAvailable::class)->handle($request, fn (Request $request) => $this->guard($request, $next));
        }

        return $this->guard($request, $next);
    }

    /**
     * Whether a request with this method and path (no leading or trailing slash, percent-decoded)
     * must pass the guard. The arch test and the route tests use this same rule.
     */
    public static function guards(string $method, string $path): bool
    {
        if (in_array(strtoupper($method), self::SAFE_METHODS, true)) {
            return false;
        }
        $path = trim($path, '/');
        if ($path !== 'api' && ! str_starts_with($path, 'api/')) {
            return false;
        }

        return ! in_array($path, self::EXEMPT_PATHS, true);
    }

    /**
     * The Origin/Referer provenance check, `hasCanonicalProvenance` (request-origin.ts:59-82).
     *
     * @param  list<string|null>  $origin  every Origin header value (empty list = absent)
     * @param  list<string|null>  $referer  every Referer header value
     */
    public static function hasCanonicalProvenance(array $origin, array $referer, string $canonical): bool
    {
        if ($origin !== []) {
            // `supplied === new URL(supplied).origin && parsed.origin === canonical` reduces to byte
            // equality, because the canonical value is itself a serialised origin. Repeated headers
            // are joined with ", " (Fetch Headers.get), which never equals an origin.
            return implode(', ', array_map(strval(...), $origin)) === $canonical;
        }

        $value = implode(', ', array_map(strval(...), $referer));
        if ($value === '' || preg_match('/[\x00-\x1f\x7f\\\\]/', $value) === 1) {
            return false;
        }
        // The raw prefix pins scheme, host and port, so the parsed origin equals the canonical one
        // and there can be no credentials; WHATWG parses any remaining path and query.
        if (! str_starts_with($value, $canonical.'/')) {
            return false;
        }
        // WHATWG `hash` is "" for no fragment and for a bare trailing "#".
        $hash = strpos($value, '#');

        return $hash === false || $hash === strlen($value) - 1;
    }

    /** The path Laravel routes on (Router: rawurldecode of the path info), without edge slashes. */
    private static function routingPath(Request $request): string
    {
        return trim(rawurldecode($request->getPathInfo()), '/');
    }

    private function guard(Request $request, Closure $next): Response
    {
        try {
            $canonical = CanonicalOrigin::fromConfig()->resolve($request);
        } catch (PublicSiteUrlRequired) {
            throw new ApiException('Request validation is temporarily unavailable.', 503, ErrorCodes::PUBLIC_SITE_URL_REQUIRED);
        }

        $origin = $request->headers->has('origin') ? $request->headers->all('origin') : [];
        if (! self::hasCanonicalProvenance($origin, $request->headers->all('referer'), $canonical)) {
            throw new ApiException(self::MESSAGE, 403, ErrorCodes::INVALID_ORIGIN);
        }
        $request->attributes->set(self::ATTRIBUTE, $canonical);

        return $next($request);
    }
}
