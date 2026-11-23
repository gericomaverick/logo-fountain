<?php

namespace App\Actions\Auth;

use App\Exceptions\AuthFailure;
use App\Models\User;
use App\Support\Auth\AuthProofs;
use App\Support\Auth\CredentialFence;
use App\Support\Auth\IssueSession;
use Illuminate\Contracts\Session\Session;
use Illuminate\Database\Connection;

/**
 * A-05 confirm half (story 4.5; Next `confirmMagicLink`, `lib/auth/service.ts:68-101`): one POST turns a magic
 * proof into a session. Shape check first (no DB read), then the whole check runs in the credential fence:
 * kind `magic`, unexpired, credential_version unchanged; the proof is deleted (single use), the mailbox is marked
 * verified, and the session is issued. A magic sign-in never sets a password, so it is not first-password proof.
 * Every failure is the generic AuthFailure and leaves the proof as it was. The caller reserves the rate limit first.
 *
 * @throws AuthFailure
 */
final class ConfirmMagicLink
{
    public function handle(string $token, Session $session): void
    {
        $userId = AuthProofs::userFor($token); // shape, then lookup

        CredentialFence::run($userId, function (Connection $db) use ($token, $userId, $session): void {
            $proof = AuthProofs::validate($db, $token, ['magic']);
            AuthProofs::consume($db, $proof);
            $db->table('users')->where('id', $userId)->whereNull('email_verified_at')->update(['email_verified_at' => now()]);

            $user = User::query()->find($userId);
            if ($user === null) {
                throw new AuthFailure;
            }
            (new IssueSession)($user, $session);
        });
    }
}
