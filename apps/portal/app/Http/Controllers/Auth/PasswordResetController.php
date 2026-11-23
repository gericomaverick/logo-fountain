<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\ResetPassword;
use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthJsonBoundary;
use App\Support\ClientAddress;
use App\Support\ErrorCodes;
use App\Support\RateLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A-07/A-08 (story 4.6): `POST /api/auth/reset-password`, serving reset and setup links (Next `reset-password/route.ts`). No session, no cookie. */
final class PasswordResetController extends Controller
{
    public function store(Request $request, ResetPassword $reset): JsonResponse
    {
        $body = AuthJsonBoundary::body($request);
        $token = is_string($body['token'] ?? null) ? $body['token'] : '';
        $password = is_string($body['newPassword'] ?? null) ? $body['newPassword'] : '';

        if (! RateLimits::consumeAuth('/'.$request->path(), ClientAddress::for($request), $token)->allowed) {
            return AuthJsonBoundary::json(['error' => ['code' => ErrorCodes::RATE_LIMITED]], 429);
        }

        $reset->handle($token, $password);

        return AuthJsonBoundary::json(['ok' => true]);
    }
}
