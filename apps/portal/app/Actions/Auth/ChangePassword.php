<?php

namespace App\Actions\Auth;

use App\Exceptions\AuthFailure;
use App\Support\Audit;
use App\Support\Auth\CredentialFence;
use App\Support\Auth\PasswordRules;
use App\Support\Auth\SessionCap;
use App\Support\ErrorCodes;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\Hash;

/**
 * A-09 (story 4.7; Next `changeCredential`, `lib/auth/service.ts:102-121`): a signed-in person changes their password.
 * Input rules first (400 INVALID_PASSWORD_CHANGE), then under the fence the original session is re-read (same id,
 * verified mailbox, inside the 7-day cap, else 401), the current password is checked (400 CURRENT_PASSWORD_INVALID),
 * the hash replaced, every session (the current one too) and proof deleted, credential_version bumped, audit written.
 * The caller reserves the rate limit and signs the current request out.
 *
 * @throws AuthFailure
 */
final class ChangePassword
{
    public function handle(string $userId, string $sessionId, int $issuedAt, string $current, string $new): void
    {
        if ($current === '' || $current === $new || ! PasswordRules::isAcceptable($new)) {
            throw new AuthFailure(400, 'INVALID_PASSWORD_CHANGE');
        }

        CredentialFence::run($userId, function (Connection $db) use ($userId, $sessionId, $issuedAt, $current, $new): void {
            $user = $db->table('users')->where('id', $userId)->first(['password', 'email_verified_at']);
            $sessionLive = $db->table('sessions')->where('id', $sessionId)->where('user_id', $userId)->exists();
            if (! is_object($user) || ! $sessionLive || $user->email_verified_at === null || ! SessionCap::isLive($issuedAt, now()->getTimestamp())) {
                throw new AuthFailure(401, ErrorCodes::UNAUTHORIZED);
            }
            $hash = is_string($user->password ?? null) && $user->password !== '' ? $user->password : null;
            if ($hash === null || ! Hash::check($current, $hash)) {
                throw new AuthFailure(400, 'CURRENT_PASSWORD_INVALID');
            }

            $db->table('users')->where('id', $userId)->update([
                'password' => Hash::make($new),
                'credential_version' => $db->raw('credential_version + 1'),
            ]);
            $db->table('sessions')->where('user_id', $userId)->delete();
            $db->table('auth_proofs')->where('user_id', $userId)->delete();
            Audit::record('auth.password_changed', null, $userId, ['method' => 'settings']);
        });
    }
}
