<?php

namespace App\Support\Auth;

use App\Exceptions\AuthFailure;
use App\Models\AuthProof;
use App\Models\User;
use Illuminate\Database\Connection;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * A-11 (proof half, ADR-006): single-use mailbox proofs. The plaintext token exists only in the return value of
 * `issue`; the table holds sha256(token), the kind and the user's credential_version at issue time. Any credential
 * transition bumps that version, which kills every outstanding proof of the user.
 */
final class AuthProofs
{
    public const LIFETIME_SECONDS = 3600;

    public const SHAPE = '/^[A-Za-z0-9_-]{20,256}$/';

    public const KINDS = ['setup', 'reset', 'magic'];

    /** Returns the plaintext token; it is never stored or recoverable. */
    public static function issue(User $user, string $kind): string
    {
        if (! in_array($kind, self::KINDS, true)) {
            throw new InvalidArgumentException("Unknown proof kind {$kind}");
        }
        $token = Str::random(43); // ~256 bits, inside SHAPE

        // Under the fence so the version stamped is the one a concurrent credential change would bump.
        CredentialFence::run($user->id, function (Connection $db) use ($user, $kind, $token): void {
            $version = self::versionOf($db, $user->id) ?? 0;
            $db->table('auth_proofs')->insert([
                'token_hash' => self::hash($token),
                'user_id' => $user->id,
                'kind' => $kind,
                'credential_version' => $version,
                'expires_at' => now()->addSeconds(self::LIFETIME_SECONDS),
            ]);
        });

        return $token;
    }

    /**
     * Call inside CredentialFence::run for the proof's user (find it with `userFor`), with that fence's connection.
     * Every failure is the same generic AuthFailure.
     *
     * @param  list<string>  $kinds
     *
     * @throws AuthFailure
     */
    public static function validate(Connection $db, string $token, array $kinds): AuthProof
    {
        $proof = self::lookup($token, $db);
        if ($proof === null || ! in_array($proof->kind, $kinds, true) || ! $proof->expires_at->greaterThan(now())) {
            throw new AuthFailure;
        }
        if (self::versionOf($db, $proof->user_id) !== $proof->credential_version) {
            throw new AuthFailure;
        }

        return $proof;
    }

    /** The user a token claims, found before the fence so the caller can open it. Shape is checked before any DB work. */
    public static function userFor(string $token): string
    {
        $proof = self::lookup($token);
        if ($proof === null) {
            throw new AuthFailure;
        }

        return $proof->user_id;
    }

    /** Single use = delete (open question 2). */
    public static function consume(Connection $db, AuthProof $proof): void
    {
        $db->table('auth_proofs')->where('token_hash', $proof->token_hash)->delete();
    }

    private static function versionOf(Connection $db, string $userId): ?int
    {
        $version = $db->table('users')->where('id', $userId)->value('credential_version');

        return is_numeric($version) ? (int) $version : null;
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    private static function lookup(string $token, ?Connection $db = null): ?AuthProof
    {
        if (preg_match(self::SHAPE, $token) !== 1) {
            throw new AuthFailure;
        }
        $model = new AuthProof;
        if ($db !== null) {
            $model->setConnection($db->getName());
        }

        return $model->newQuery()->where('token_hash', self::hash($token))->first();
    }
}
