<?php

namespace App\Http\Middleware;

use App\Http\RawCacheControlHeaderBag;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

/**
 * X-02 / ADR-027: the response headers of apps/web/next.config.ts, on every response (pages,
 * /api/*, 404s). Registered as the outermost global middleware, so like next.config it runs
 * after the route and overrides a route's own value (e.g. /api/auth/* Referrer-Policy).
 * HSTS is set at the edge, not here.
 */
final class SecurityHeaders
{
    /** Token pages: no Referer leak and no caching (next.config.ts:44). */
    public const TOKEN_PAGES = ['auth/callback', 'set-password', 'reset-password'];

    public const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com"), usb=()';

    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        $headers = $response->headers;
        // Staged as report-only (as in Next): no collector, browser-console diagnostics only.
        $headers->set('Content-Security-Policy-Report-Only', self::contentSecurityPolicy());
        $headers->set('X-Frame-Options', 'DENY');
        $headers->set('X-Content-Type-Options', 'nosniff');
        $headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $headers->set('Permissions-Policy', self::PERMISSIONS_POLICY);

        if (in_array(strtolower(trim($request->path(), '/')), self::TOKEN_PAGES, true)) {
            $response->headers->set('Referrer-Policy', 'no-referrer');
            RawCacheControlHeaderBag::noStore($response);
        }

        return $response;
    }

    /** The next.config.ts directives; locally also 'unsafe-eval' (as `next dev`) and the Vite dev server. */
    public static function contentSecurityPolicy(): string
    {
        $local = app()->environment('local');
        $vite = $local ? self::viteDevOrigin() : null;
        $dev = $vite === null ? '' : ' '.$vite;
        $devWs = $vite === null ? '' : ' '.preg_replace('/^http/', 'ws', $vite);

        return implode('; ', [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "script-src 'self' 'unsafe-inline'".($local ? " 'unsafe-eval'" : '').' https://js.stripe.com'.$dev,
            "style-src 'self' 'unsafe-inline'".$dev,
            "img-src 'self' data: blob: https:".$dev,
            "font-src 'self' data:".$dev,
            "connect-src 'self' https://api.stripe.com".$dev.$devWs,
            'frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com',
            "worker-src 'self' blob:",
            "manifest-src 'self'",
        ]);
    }

    private static function viteDevOrigin(): ?string
    {
        if (! Vite::isRunningHot()) {
            return null;
        }
        $hot = @file_get_contents(Vite::hotFile());
        if ($hot === false) {
            return null;
        }
        $parts = parse_url(trim($hot));
        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        return $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
    }
}
