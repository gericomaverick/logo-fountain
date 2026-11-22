<?php

namespace App\Actions\Auth;

use App\Models\User;
use App\Support\Auth\CredentialFence;
use App\Support\Auth\IssueSession;
use Illuminate\Contracts\Session\Session;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\Hash;

/**
 * A-01 (story 4.3; Next `login`, `lib/auth/service.ts:62-67`): checks the password and, on success, issues the session.
 * Every failure is the same `false`: wrong password, unknown account, no password, unverified mailbox.
 *
 * Existing account: the check and the session run in the credential fence (ADR-007), so a login cannot
 * interleave with a change or reset. Read the row again inside it: the password may have just changed.
 * DV-19 (proposed): every attempt costs exactly one hash comparison, against a fixed dummy hash when there is
 * nothing real to compare, so response time does not reveal which accounts exist (Next's unknown-account path is unproven).
 * The caller reserves the rate limit first (`RateLimits::reserveLogin`, before any transaction).
 */
final class Login
{
    /** bcrypt cost 12 of a random string nobody knows. Never matches a password that fits in 72 bytes. */
    public const DUMMY_HASH = '$2y$12$3qrL80SSWfjr.HfWsaKcLuPmhiLk5g1e83tf1QGrwQbRfrW7bWbqq';

    public function handle(string $email, string $password, Session $session): bool
    {
        $user = User::query()->where('email', $email)->first();
        if ($user === null) {
            Hash::check($password, self::DUMMY_HASH);

            return false;
        }

        return CredentialFence::run($user->id, function (Connection $db) use ($user, $password, $session): bool {
            $row = $db->table('users')->where('id', $user->id)->first(['password', 'email_verified_at']);
            $hash = is_object($row) && is_string($row->password ?? null) && $row->password !== '' ? $row->password : null;
            $verified = is_object($row) && ($row->email_verified_at ?? null) !== null;

            // One comparison on every path (DV-19).
            $matches = Hash::check($password, $hash ?? self::DUMMY_HASH);
            if ($hash === null || ! $verified || ! $matches) {
                return false;
            }

            (new IssueSession)($user, $session);

            return true;
        });
    }
}
