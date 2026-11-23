<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\ConfirmMagicLink;
use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthJsonBoundary;
use App\Support\ClientAddress;
use App\Support\ErrorCodes;
use App\Support\RateLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A-05 confirm half (story 4.5): `POST /api/auth/magic-link/verify`, Next `magic-link/verify/route.ts`. No redirect: the page decides. */
final class MagicLinkController extends Controller
{
    public function verify(Request $request, ConfirmMagicLink $confirm): JsonResponse
    {
        $body = AuthJsonBoundary::body($request);
        $token = is_string($body['token'] ?? null) ? $body['token'] : '';

        if (! RateLimits::consumeAuth('/'.$request->path(), ClientAddress::for($request), $token)->allowed) {
            return AuthJsonBoundary::json(['error' => ['code' => ErrorCodes::RATE_LIMITED]], 429);
        }

        $confirm->handle($token, $request->session());

        return AuthJsonBoundary::json(['ok' => true]);
    }
}
