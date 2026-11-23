<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\ChangePassword;
use App\Exceptions\AuthFailure;
use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthJsonBoundary;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\User;
use App\Support\ClientAddress;
use App\Support\ErrorCodes;
use App\Support\RateLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/** A-02 logout and A-09 change password (story 4.7; Next `logout/route.ts`, `password/route.ts`). */
final class AccountSessionController extends Controller
{
    public function logout(Request $request): JsonResponse
    {
        try {
            $request->session()->invalidate();
        } catch (Throwable $e) {
            report($e);

            return AuthJsonBoundary::json(['error' => ['code' => 'LOGOUT_FAILED', 'message' => 'Could not sign out. Please retry.']], 503);
        }

        return AuthJsonBoundary::json(['ok' => true]);
    }

    public function changePassword(Request $request, ChangePassword $change): JsonResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new AuthFailure(401, ErrorCodes::UNAUTHORIZED);
        }
        $body = AuthJsonBoundary::body($request);
        $current = is_string($body['currentPassword'] ?? null) ? $body['currentPassword'] : '';
        $new = is_string($body['newPassword'] ?? null) ? $body['newPassword'] : '';

        if (! RateLimits::consumeAuth('/'.$request->path(), ClientAddress::for($request), $user->id)->allowed) {
            return AuthJsonBoundary::json(['error' => ['code' => ErrorCodes::RATE_LIMITED]], 429);
        }

        $issuedAt = $request->session()->get('auth.issued_at');
        $change->handle($user->id, $request->session()->getId(), is_int($issuedAt) ? $issuedAt : 0, $current, $new);
        $request->session()->invalidate();

        return AuthJsonBoundary::json(['ok' => true, 'signedOut' => true]);
    }
}
