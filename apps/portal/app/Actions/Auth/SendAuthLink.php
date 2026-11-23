<?php

namespace App\Actions\Auth;

use App\Domain\CanonicalOrigin;
use App\Mail\AuthLinkMail;
use App\Models\User;
use App\Support\Auth\AuthProofs;
use App\Support\Auth\CredentialFence;
use App\Support\Auth\SafeNext;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Throwable;

/**
 * A-06 (set-password link half), A-11 (send half) (story 4.4; Next `requestAuthLink`, `lib/auth/service.ts:21-58`).
 * One proof and one email per call. The proof is written inside the credential fence (ADR-007); the email is
 * sent synchronously AFTER the transaction commits (ADR-018, auth mode), so no lock or connection is held
 * during the send. A failed send deletes the proof (a dead link) and throws a fixed message with no link in it.
 * Epic 5's provisioning calls `handle` for the setup email.
 */
final class SendAuthLink
{
    public const FAILURE = 'Authentication email delivery failed';

    /** Returns the kind actually issued (null: no such account). Email is trimmed and lowercased by the caller. */
    /** @param  'setup'|'reset'|'magic'  $kind */
    public function request(string $email, string $kind, string $next = '/dashboard'): ?string
    {
        $user = User::query()->where('email', $email)->first();

        return $user === null ? null : $this->handle($user, $kind, $next);
    }

    /** @param  'setup'|'reset'|'magic'  $kind */
    public function handle(User $user, string $kind, string $next = '/dashboard'): string
    {
        [$effective, $token] = CredentialFence::run($user->id, function (Connection $db) use ($user, $kind): array {
            // Setup may only create a FIRST credential. Re-checked under the fence: once a password exists it
            // degrades to a sign-in link and can never reset an existing password.
            $effective = $kind === 'setup' && $this->hasPassword($db, $user->id) ? 'magic' : $kind;

            return [$effective, AuthProofs::issueIn($db, $user, $effective)];
        });

        // Committed; lock and connection released. Send now.
        try {
            $this->assertConfigured();
            $link = self::link($effective, $token, SafeNext::path($next));
            Mail::mailer(Config::string('mail.default'))->send(new AuthLinkMail($user->email, $effective, $link));
        } catch (Throwable) {
            AuthProofs::discard($token);
            // Never carry the link, the token or a provider body (it may echo the message).
            throw new RuntimeException(self::FAILURE);
        }

        return $effective;
    }

    /** Token in the fragment, never the query: `#token=…&next=…` as URLSearchParams writes it. */
    public static function link(string $kind, string $token, string $next): string
    {
        $path = match ($kind) {
            'setup' => '/set-password',
            'reset' => '/reset-password',
            default => '/auth/callback',
        };
        $fragment = str_replace('%2A', '*', http_build_query(['token' => $token, 'next' => $next], '', '&', PHP_QUERY_RFC1738));

        return rtrim(CanonicalOrigin::fromConfig()->resolve(), '/').$path.'#'.$fragment;
    }

    private function hasPassword(Connection $db, string $userId): bool
    {
        $hash = $db->table('users')->where('id', $userId)->value('password');

        return is_string($hash) && $hash !== '';
    }

    public static function configured(): bool
    {
        return trim(Config::string('mail.from.address', '')) !== ''
            && (config('mail.default') !== 'postmark' || trim(Config::string('services.postmark.token', '')) !== '');
    }

    /** Next: "Authentication email delivery is not configured" (`mail.ts:19`). */
    private function assertConfigured(): void
    {
        if (! self::configured()) {
            throw new RuntimeException('Authentication email delivery is not configured');
        }
    }
}
