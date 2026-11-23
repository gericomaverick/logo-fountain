<?php

namespace App\Support;

use App\Domain\CanonicalOrigin;
use App\Jobs\SendLifecycleMail;
use App\Models\ClientMembership;
use App\Models\Project;
use App\Models\ProjectBrief;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Story 2.7 (X-18, DV-8, ADR-018, ADR-019): the one way to send a lifecycle email at most once per event.
 *
 * `sendOnce` decides synchronously (callers branch on `skipped`: the Stripe webhook, `finals/notify`): marker →
 * recipient → configuration, as Next's order. Otherwise it writes the `email_sent:*` marker through `Audit::record`
 * in the caller's transaction (Open question 1, built as recommended: at dispatch, not after the send) and queues
 * `SendLifecycleMail` after commit. A rollback therefore leaves no marker and no job. `sent` means QUEUED, not
 * delivered (DV-8): a transport failure is retried by the job, then lands in `failed_jobs`; it never reaches the caller.
 * Because the marker exists at dispatch, an email whose retries are exhausted is not resent for that event.
 */
final class LifecycleMail
{
    /** The marker type: `email_sent:<type>` or `email_sent:<type>:<key>` (N-04…N-12; `$key` null for the keyless forms). */
    public static function markerType(string $type, ?string $key = null): string
    {
        return $key === null || $key === '' ? "email_sent:{$type}" : "email_sent:{$type}:{$key}";
    }

    public static function sendOnce(string $type, string $projectId, ?string $key, LifecycleMessage $message): LifecycleMailResult
    {
        $marker = self::markerType($type, $key);
        if (self::alreadySent($projectId, $marker)) {
            return LifecycleMailResult::alreadySent();
        }

        $project = Project::query()->with(['client.memberships' => fn ($q) => $q->orderBy('created_at')->orderBy('id'), 'client.memberships.profile'])->find($projectId);
        $recipients = $message->admin ? self::adminRecipients() : self::clientRecipients($project);
        if ($recipients === []) {
            return LifecycleMailResult::skipped(LifecycleMailResult::MISSING_RECIPIENT);
        }

        if (! self::configured()) {
            Log::warning('Lifecycle email skipped: mail is not configured.');

            return LifecycleMailResult::skipped(LifecycleMailResult::NOT_CONFIGURED);
        }

        $url = self::ctaUrl($message->ctaPath);
        $clientName = $brandName = null;
        if ($message->admin) {
            $clientName = self::clientName($project);
            $brandName = self::brandName($project);
        }

        Audit::record($marker, $projectId, null, []);
        SendLifecycleMail::dispatch(
            $recipients,
            $message->subject,
            $message->admin ? $message->subject : ($message->heading ?? $message->subject),
            $message->intro,
            $message->ctaLabel,
            $url,
            $message->admin,
            $clientName,
            $brandName,
        );

        return LifecycleMailResult::sent();
    }

    /**
     * Story 5.2 (DV-15): an admin alert with no project to key a marker on (an unknown Checkout Session). The caller
     * dedupes (it dispatches in the same transaction that settles the webhook ledger row). Skips, never throws, on
     * a missing recipient or mail configuration.
     */
    public static function sendAdminAlert(LifecycleMessage $message): LifecycleMailResult
    {
        $recipients = self::adminRecipients();
        if ($recipients === []) {
            return LifecycleMailResult::skipped(LifecycleMailResult::MISSING_RECIPIENT);
        }
        if (! self::configured()) {
            Log::warning('Lifecycle email skipped: mail is not configured.');

            return LifecycleMailResult::skipped(LifecycleMailResult::NOT_CONFIGURED);
        }
        SendLifecycleMail::dispatch($recipients, $message->subject, $message->subject, $message->intro, $message->ctaLabel, self::ctaUrl($message->ctaPath), true, null, null);

        return LifecycleMailResult::sent();
    }

    /** @return list<string> */
    public static function adminRecipients(): array
    {
        $raw = config('portal.admin_notification_emails');
        $list = array_map(fn (string $e): string => strtolower(trim($e)), explode(',', is_string($raw) ? $raw : ''));

        return array_values(array_filter($list, fn (string $e): bool => $e !== ''));
    }

    private static function alreadySent(string $projectId, string $marker): bool
    {
        return DB::connection(DatabaseRoles::RUNTIME)->table('audit_events')
            ->where('project_id', $projectId)->where('type', $marker)->exists();
    }

    private static function owner(?Project $project): ?ClientMembership
    {
        $memberships = $project?->client?->memberships;

        return $memberships?->first(fn (ClientMembership $m): bool => strtolower($m->role) === 'owner') ?? $memberships?->first();
    }

    /** @return list<string> billing email, else the owner's (else first member's) email: `resolveClientEmail`. */
    private static function clientRecipients(?Project $project): array
    {
        $billing = trim((string) $project?->client?->billing_email);
        if ($billing !== '') {
            return [$billing];
        }
        $owner = trim((string) self::owner($project)?->profile?->email);

        return $owner !== '' ? [$owner] : [];
    }

    private static function clientName(?Project $project): string
    {
        $profile = self::owner($project)?->profile;
        $merged = trim(implode(' ', array_filter([trim((string) $profile?->first_name), trim((string) $profile?->last_name)], fn (string $p): bool => $p !== '')));
        $full = trim((string) $profile?->full_name);

        return $merged !== '' ? $merged : ($full !== '' ? $full : 'Client');
    }

    /** `answers.brandName` of the latest brief, else the client's name (trimmed; blank stays blank, Next's `??`), else "Unknown brand". */
    private static function brandName(?Project $project): string
    {
        $latest = $project === null ? null : ProjectBrief::query()->where('project_id', $project->id)->orderByDesc('version')->first();
        $answers = $latest?->answers;
        $brand = is_object($answers) ? ($answers->brandName ?? null) : (is_array($answers) ? ($answers['brandName'] ?? null) : null);
        if (is_string($brand) && trim($brand) !== '') {
            return trim($brand);
        }
        $client = $project?->client?->name;

        return $client === null ? 'Unknown brand' : trim($client);
    }

    /** Next's rule (`project-lifecycle-email.ts:109-116`; Open question 7): a from address, and a token when Postmark is the mailer. */
    private static function configured(): bool
    {
        if (trim(Config::string('mail.from.address', '')) === '') {
            return false;
        }

        return config('mail.default') !== 'postmark' || trim(Config::string('services.postmark.token', '')) !== '';
    }

    /** Absolute `https` (loopback `http` outside production), no credentials: Next's `requireSafeCtaUrl`. */
    private static function ctaUrl(string $path): string
    {
        $url = rtrim(CanonicalOrigin::fromConfig()->resolve(), '/').'/'.ltrim($path, '/');
        $parts = parse_url($url);
        $host = strtolower((string) ($parts['host'] ?? ''));
        $loopback = in_array($host, ['localhost', '127.0.0.1', '[::1]'], true) && ! app()->isProduction();
        $scheme = $parts['scheme'] ?? '';
        if (isset($parts['user']) || isset($parts['pass']) || preg_match('/[\x00-\x1f\x7f]/', $url) === 1
            || ! ($scheme === 'https' || ($scheme === 'http' && $loopback))) {
            throw new InvalidArgumentException('Transactional email CTA URL must be an absolute HTTPS URL');
        }

        return $url;
    }
}
