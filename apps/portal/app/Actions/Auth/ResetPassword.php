<?php

namespace App\Actions\Auth;

use App\Exceptions\AuthFailure;
use App\Support\Audit;
use App\Support\Auth\AuthProofs;
use App\Support\Auth\CredentialFence;
use App\Support\Auth\PasswordRules;
use App\Support\ErrorCodes;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\Hash;

/**
 * A-07/A-08 (story 4.6; Next `resetCredential`, `lib/auth/service.ts:74-88`): one reset or setup proof sets the
 * password. Rules first (WEAK_PASSWORD 400, before the proof is read), then one fence transaction: validate the
 * proof (kind reset or setup, unexpired, version unchanged), set the hash, verify the mailbox, bump
 * credential_version, delete every proof and every session of the user, audit `auth.password_reset`. Any failure
 * rolls the whole thing back. No session is issued: the person signs in afterwards.
 * The caller reserves the rate limit first.
 *
 * @throws AuthFailure
 */
final class ResetPassword
{
    public function handle(string $token, string $newPassword): void
    {
        if (! PasswordRules::isAcceptable($newPassword)) {
            throw new AuthFailure(400, ErrorCodes::WEAK_PASSWORD);
        }
        $userId = AuthProofs::userFor($token);

        CredentialFence::run($userId, function (Connection $db) use ($token, $userId, $newPassword): void {
            $proof = AuthProofs::validate($db, $token, ['reset', 'setup']);
            $db->table('users')->where('id', $userId)->update([
                'password' => Hash::make($newPassword),
                'email_verified_at' => $db->raw('COALESCE(email_verified_at, now())'),
                'credential_version' => $db->raw('credential_version + 1'),
            ]);
            $db->table('auth_proofs')->where('user_id', $userId)->delete();
            $db->table('sessions')->where('user_id', $userId)->delete();
            Audit::record('auth.password_reset', null, $userId, ['method' => $proof->kind]);
        });
    }
}
