<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Models\User;
use App\Support\ErrorCodes;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A-16 (story 4.8): alias `admin`. Verified user first (401 / login redirect), then `User::isAdmin()` read from
 * the freshly loaded profile: 403 `FORBIDDEN` `{nextStep: "Use an admin account."}` (`require.ts:43`).
 */
final class RequireAdmin extends RequireVerifiedUser
{
    protected function guard(Request $request, Closure $next): Response
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            return parent::guard($request, $next);
        }
        if (! $user->isAdmin()) {
            throw new ApiException('Forbidden', 403, ErrorCodes::FORBIDDEN, ['nextStep' => 'Use an admin account.']);
        }

        return $next($request);
    }
}
