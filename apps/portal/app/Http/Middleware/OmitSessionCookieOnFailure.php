<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Story 4.3 AC 2: a failed sign-in sets no cookie (Next sets one only on success). Laravel's StartSession adds the
 * session cookie to every response, so this runs outside it (priority in bootstrap/app.php) and removes it from 4xx/5xx.
 */
final class OmitSessionCookieOnFailure
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);
        // The CSRF cookie is the web group's, not Next's: /api/* is exempt from it (ADR-008), so never sent.
        $response->headers->removeCookie('XSRF-TOKEN', '/', null);
        if ($response->getStatusCode() >= 400) {
            $name = config('session.cookie');
            $path = config('session.path');
            $domain = config('session.domain');
            if (is_string($name)) {
                $response->headers->removeCookie($name, is_string($path) ? $path : '/', is_string($domain) ? $domain : null);
            }
        }

        return $response;
    }
}
