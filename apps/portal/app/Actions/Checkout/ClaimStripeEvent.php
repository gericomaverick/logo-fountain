<?php

namespace App\Actions\Checkout;

use App\Support\DatabaseRoles;
use App\Support\Stripe\WebhookClaimLost;
use Illuminate\Database\Connection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The webhook ledger's claim (K-05, `webhook/route.ts:14-125,210-218`; ADR-014): `stripe_events.type` holds the
 * lease marker `processing:{ms}:{uuid}:{eventType}`, so there is no extra column. Every write is one statement
 * keyed on the marker string (compare-and-set), so a reclaimed delivery cannot be completed by the old owner.
 */
final class ClaimStripeEvent
{
    public const LEASE_MS = 5 * 60 * 1000;

    private const PREFIX = 'processing:';

    public function claim(string $eventId, string $eventType, int $eventCreated): Claim|ClaimOutcome
    {
        $marker = self::marker($eventType);
        $inserted = $this->db()->table('stripe_events')->insertOrIgnore([
            'event_id' => $eventId,
            'type' => $marker,
            'created_at' => gmdate('Y-m-d H:i:s', $eventCreated).'.000',
        ]);
        if ($inserted === 1) {
            return new Claim($eventId, $eventType, $marker);
        }

        $existing = $this->db()->table('stripe_events')->where('event_id', $eventId)->first(['type', 'processed_at']);
        if ($existing === null) {
            return ClaimOutcome::InFlight; // deleted between our insert and read: Next answers 409 too
        }
        if ($existing->processed_at !== null) {
            return ClaimOutcome::Deduped;
        }
        $startedAt = self::startedAt((string) $existing->type);
        if ($startedAt !== null && Carbon::now()->getTimestampMs() - $startedAt < self::LEASE_MS) {
            return ClaimOutcome::InFlight;
        }

        // Expired, or a legacy unmarked row: take it over only if nobody else has.
        $reclaimed = $this->db()->table('stripe_events')
            ->where('event_id', $eventId)->where('type', $existing->type)->whereNull('processed_at')
            ->update(['type' => $marker]);

        return $reclaimed === 1 ? new Claim($eventId, $eventType, $marker) : ClaimOutcome::InFlight;
    }

    /** The lease fence: a fresh marker under the current one. No row changed → the claim is lost. */
    public function renew(Claim $claim): void
    {
        $fresh = self::marker($claim->eventType);
        $n = $this->db()->table('stripe_events')
            ->where('event_id', $claim->eventId)->where('type', $claim->marker)->whereNull('processed_at')
            ->update(['type' => $fresh]);
        if ($n !== 1) {
            throw new WebhookClaimLost('Stripe webhook processing claim ownership was lost');
        }
        $claim->marker = $fresh;
    }

    /** Settle the row under the marker. False when the claim was already lost. */
    public function complete(Claim $claim): bool
    {
        return $this->db()->table('stripe_events')
            ->where('event_id', $claim->eventId)->where('type', $claim->marker)->whereNull('processed_at')
            ->update(['type' => $claim->eventType, 'processed_at' => Carbon::now()->utc()->format('Y-m-d H:i:s.v')]) === 1;
    }

    /** Transient failure: free only this delivery's claim so the retry can take it. */
    public function release(Claim $claim): void
    {
        $this->db()->table('stripe_events')
            ->where('event_id', $claim->eventId)->where('type', $claim->marker)->whereNull('processed_at')
            ->delete();
    }

    /** An event that never fulfils (`route.ts:50-78`): recorded as processed. */
    public function settleIgnored(string $eventId, string $eventType, int $eventCreated): void
    {
        $now = Carbon::now()->utc()->format('Y-m-d H:i:s.v');
        $this->db()->table('stripe_events')->upsert(
            [['event_id' => $eventId, 'type' => $eventType, 'created_at' => gmdate('Y-m-d H:i:s', $eventCreated).'.000', 'processed_at' => $now]],
            ['event_id'],
            ['type', 'processed_at'],
        );
    }

    public static function marker(string $eventType): string
    {
        return self::PREFIX.Carbon::now()->getTimestampMs().':'.Str::uuid().':'.$eventType;
    }

    public static function startedAt(string $type): ?int
    {
        if (! str_starts_with($type, self::PREFIX)) {
            return null;
        }
        $stamp = explode(':', substr($type, strlen(self::PREFIX)), 2)[0];

        return ctype_digit($stamp) ? (int) $stamp : null;
    }

    private function db(): Connection
    {
        return DB::connection(DatabaseRoles::RUNTIME);
    }
}
