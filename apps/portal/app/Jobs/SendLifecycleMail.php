<?php

namespace App\Jobs;

use App\Mail\LifecycleMailable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Symfony\Component\Mailer\Exception\HttpTransportException;
use Throwable;

/**
 * Story 2.7 (ADR-018, ADR-019, DV-8): sends one lifecycle email, queued after the caller's commit. One queue hop:
 * the mailable is sent synchronously here, so this job owns the failure text. Symfony's Postmark exception carries
 * the provider's response body and Laravel stores exception text in `failed_jobs`, so a failure is replaced with
 * `Postmark send failed (<status>)` (Next `:136-137`) before it is logged or rethrown. 4 tries: the first plus one
 * per backoff value (10, 60, 300 s). The payload is plain strings (no tokens, no signed URLs in lifecycle mail).
 */
final class SendLifecycleMail implements ShouldQueue, ShouldQueueAfterCommit
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 4;

    /** @param  list<string>  $recipients */
    public function __construct(
        public readonly array $recipients,
        public readonly string $subject,
        public readonly string $heading,
        public readonly string $intro,
        public readonly string $ctaLabel,
        public readonly string $ctaUrl,
        public readonly bool $admin,
        public readonly ?string $clientName,
        public readonly ?string $brandName,
    ) {}

    /** @return list<int> */
    public function backoff(): array
    {
        return [10, 60, 300];
    }

    public function handle(): void
    {
        try {
            Mail::mailer(Config::string('mail.default'))->send(new LifecycleMailable(
                $this->recipients, $this->subject, $this->heading, $this->intro, $this->ctaLabel,
                $this->ctaUrl, $this->admin, $this->clientName, $this->brandName,
            ));
        } catch (Throwable $e) {
            $status = $e instanceof HttpTransportException ? (string) $e->getResponse()->getStatusCode() : 'transport error';
            $message = "Postmark send failed ({$status})";
            Log::error($message);

            throw new RuntimeException($message);
        }
    }
}
