<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\Auth\SessionCap;
use App\Support\ErrorCodes;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * A-03 / A-04 (story 4.1; Next `sessionFromHeaders`, `lib/auth/service.ts:14-19`): decides, once per request and
 * from the database, whether the session is a session. Dead (past seven days, user gone, mailbox unverified)
 * → the session is invalidated (the row is deleted; open question 2) and the request is anonymous.
 * Live → `$request->attributes` carries the freshly loaded user (with profile). Never trusts a cookie or cache.
 * Any failure of the lookup is `503 SESSION_VERIFICATION_UNAVAILABLE` and leaks nothing.
 */
final class EnforceSessionCap
{
    public const USER = 'auth.user';

    public function handle(Request $request, Closure $next): Response
    {
        $session = $request->session();
        $userId = $session->get('auth.user_id');
        $issuedAt = $session->get('auth.issued_at');

        $user = null;
        if (is_string($userId) && is_int($issuedAt)) {
            try {
                $user = User::query()->with('profile')->find($userId);
            } catch (Throwable $e) {
                report($e);

                return self::unavailable();
            }

            if ($user === null || $user->email_verified_at === null || ! SessionCap::isLive($issuedAt, now()->getTimestamp())) {
                $user = null;
                $session->invalidate();
            }
        } elseif ($userId !== null || $issuedAt !== null) {
            $session->invalidate();
        }

        $request->attributes->set(self::USER, $user);

        return $next($request);
    }

    private static function unavailable(): HttpResponse
    {
        return new HttpResponse(
            (string) json_encode(['error' => ['code' => ErrorCodes::SESSION_VERIFICATION_UNAVAILABLE, 'message' => 'Could not verify session. Please retry.']]),
            503,
            ['Content-Type' => 'application/json', 'Cache-Control' => 'no-store'],
        );
    }
}
