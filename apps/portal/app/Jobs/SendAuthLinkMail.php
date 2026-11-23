<?php

namespace App\Jobs;

use App\Actions\Auth\SendAuthLink;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * Story 4.4 Q2 (owner correction 2026-11-23): the sign-in / reset link request answers in equal time for a known and
 * an unknown address. The request only looks the account up and queues this job (for both paths: an unknown account
 * queues a job with no user id, which does nothing). The proof is issued and the email sent here, so the response
 * never waits on either. The payload holds the user id, never the token or the link. `SendAuthLink::handle` deletes
 * the proof when a send fails and throws the fixed message, so a retry issues a fresh one.
 */
final class SendAuthLinkMail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 3;

    /** @param  'magic'|'reset'  $kind */
    public function __construct(public readonly ?string $userId, public readonly string $kind, public readonly string $next) {}

    /** @return list<int> */
    public function backoff(): array
    {
        return [10, 60];
    }

    public function handle(SendAuthLink $send): void
    {
        $user = $this->userId === null ? null : User::query()->find($this->userId);
        if ($user !== null) {
            $send->handle($user, $this->kind, $this->next);
        }
    }
}
