<?php

namespace App\Http\Middleware;

use App\Support\AuthProxyConfig;
use App\Support\ClientAddress;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * X-05 / ADR-010 (story 1.5), global (arch §4.1): derives the trusted client address once per
 * request and stores it in `ClientAddress::ATTRIBUTE` (null = unknown). It never rejects: the
 * production fail-closed is `EnsureAuthAvailable`, on auth routes only. Read it with
 * `ClientAddress::for($request)`, never `$request->ip()`.
 */
final class TrustedClientAddress
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->attributes->set(ClientAddress::ATTRIBUTE, ClientAddress::trusted($request, AuthProxyConfig::fromConfig()));

        return $next($request);
    }
}
