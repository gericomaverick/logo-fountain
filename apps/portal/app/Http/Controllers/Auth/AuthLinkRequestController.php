<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\SendAuthLink;
use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthJsonBoundary;
use App\Support\ClientAddress;
use App\Support\ErrorCodes;
use App\Support\NodeCompat;
use App\Support\RateLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * A-05/A-07 request halves (story 4.4): `POST /api/auth/magic-link` and `/forgot-password`
 * (Next `magic-link/route.ts`, `forgot-password/route.ts`). The answer never says whether an account exists,
 * the limit denied, or delivery failed.
 */
final class AuthLinkRequestController extends Controller
{
    public function magicLink(Request $request, SendAuthLink $send): JsonResponse
    {
        $body = AuthJsonBoundary::body($request);
        $email = self::email($body);
        if (str_contains($email, '@') && $this->allowed($request, $email)) {
            $this->quietly(fn () => $send->request($email, 'magic', is_string($body['next'] ?? null) ? $body['next'] : ''));
        }

        return AuthJsonBoundary::json(['ok' => true, 'message' => 'If that account exists, a sign-in link has been sent.']);
    }

    public function forgotPassword(Request $request, SendAuthLink $send): JsonResponse
    {
        $email = self::email(AuthJsonBoundary::body($request));
        if ($email === '' || ! str_contains($email, '@')) {
            return AuthJsonBoundary::json(['error' => ['code' => ErrorCodes::INVALID_EMAIL, 'message' => 'Enter a valid email address.']], 400);
        }
        if ($this->allowed($request, $email)) {
            $this->quietly(fn () => $send->request($email, 'reset', '/dashboard'));
        }

        return AuthJsonBoundary::json(['ok' => true, 'message' => 'If that account exists, a password recovery email has been sent.']);
    }

    /** @param  array<string, mixed>  $body */
    private static function email(array $body): string
    {
        return NodeCompat::lower(NodeCompat::trimEnv(is_string($body['email'] ?? null) ? $body['email'] : ''));
    }

    private function allowed(Request $request, string $email): bool
    {
        return RateLimits::consumeAuth('/'.$request->path(), ClientAddress::for($request), $email)->allowed;
    }

    /** No enumeration and no provider diagnostics: a failure is swallowed (Next `catch {}`). */
    private function quietly(callable $work): void
    {
        try {
            $work();
        } catch (Throwable) {
        }
    }
}
