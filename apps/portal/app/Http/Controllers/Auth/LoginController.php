<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\Login;
use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthJsonBoundary;
use App\Support\ClientAddress;
use App\Support\ErrorCodes;
use App\Support\NodeCompat;
use App\Support\RateLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A-01 (story 4.3): `POST /api/auth/login`, Next `app/api/auth/login/route.ts`. No remember-me, no registration. */
final class LoginController extends Controller
{
    public const MESSAGE = 'Email or password is incorrect, or mailbox verification is required.';

    public const MAX_PASSWORD_BYTES = 72;

    public function store(Request $request, Login $login): JsonResponse
    {
        $body = AuthJsonBoundary::body($request);
        $email = NodeCompat::lower(NodeCompat::trimEnv(is_string($body['email'] ?? null) ? $body['email'] : ''));
        $password = is_string($body['password'] ?? null) ? $body['password'] : '';

        // Before any limiter work (login/route.ts:9-11).
        if ($email === '' || $password === '' || strlen($password) > self::MAX_PASSWORD_BYTES) {
            return self::invalid();
        }

        $address = ClientAddress::for($request);
        // Reserved before the password check; a limited attempt never reaches the hash.
        if (! RateLimits::reserveLogin($address, $email)->allowed) {
            return self::invalid();
        }

        if (! $login->handle($email, $password, $request->session())) {
            return self::invalid();
        }

        RateLimits::clearLoginFailures($address, $email);

        return AuthJsonBoundary::json(['ok' => true]);
    }

    private static function invalid(): JsonResponse
    {
        return AuthJsonBoundary::json(['error' => ['code' => ErrorCodes::INVALID_CREDENTIALS, 'message' => self::MESSAGE]], 400);
    }
}
