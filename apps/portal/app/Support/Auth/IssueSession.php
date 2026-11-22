<?php

namespace App\Support\Auth;

use App\Models\User;
use Illuminate\Contracts\Session\Session;
use Illuminate\Support\Facades\Auth;

/**
 * Story 4.1 AC 9 (ADR-005): the one way a session is created (4.3 sign-in, 4.5 magic link, 4.6 reset).
 * Signs the user in on the `web` guard (which regenerates the id and so kills any pre-login session) and
 * stamps `auth.issued_at` once. The sessions table has no creation column, so the payload carries it.
 * Nothing ever rewrites `auth.issued_at`: the cap is absolute, not sliding.
 */
final class IssueSession
{
    public function __invoke(User $user, Session $session): void
    {
        Auth::guard('web')->login($user);
        $session->regenerate(true);
        $session->put('auth.user_id', $user->id);
        $session->put('auth.issued_at', now()->getTimestamp());
    }
}
