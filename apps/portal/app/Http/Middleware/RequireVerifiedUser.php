<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Models\User;
use App\Support\Auth\SafeNext;
use App\Support\ErrorCodes;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A-16 / A-04 (story 4.8): alias `auth.verified`. The signed-in, mailbox-verified user, decided from the database
 * by EnforceSessionCap on every request (never from the session payload; it is run here when the route did not).
 * Guarded API routes answer 401 `UNAUTHORIZED` (`require.ts:33`); pages redirect to `/login?next=<SafeNext>`.
 */
class RequireVerifiedUser
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->attributes->has(EnforceSessionCap::USER)) {
            return (new EnforceSessionCap)->handle($request, fn (Request $r) => $this->guard($r, $next));
        }

        return $this->guard($request, $next);
    }

    protected function guard(Request $request, Closure $next): Response
    {
        if ($request->attributes->get(EnforceSessionCap::USER) instanceof User) {
            return $next($request);
        }
        if ($request->is('api/*') || $request->expectsJson()) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }

        $path = $request->getRequestUri();
        $safe = SafeNext::path($path, '');

        return redirect($safe === '' ? '/login' : '/login?next='.rawurlencode($safe));
    }
}
