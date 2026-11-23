<?php

namespace App\Actions\Checkout;

use App\Support\Audit;
use App\Support\DatabaseRoles;
use App\Support\LifecycleMail;
use App\Support\LifecycleMessage;
use App\Support\Stripe\HopelessCheckoutFailure;
use Illuminate\Support\Facades\DB;

/**
 * DV-15 / DV-21 (story 5.2 AC 11, 12): settle the event, audit it, tell the admin, once. The ledger row is completed
 * under the claim's marker and the alert is queued in the same transaction (after commit), so a redelivery answers
 * `deduped` and sends nothing; a lost claim writes nothing. "Flagged stuck" is an audit event `checkout_stuck`
 * on the project when there is one (Open question 1: no new column).
 */
final class RecordHopelessCheckout
{
    public const SUBJECT = 'Payment needs attention';

    public function __construct(private readonly ClaimStripeEvent $claims) {}

    public function handle(Claim $claim, HopelessCheckoutFailure $failure): void
    {
        DB::connection(DatabaseRoles::RUNTIME)->transaction(function () use ($claim, $failure): void {
            if (! $this->claims->complete($claim)) {
                return;
            }
            $message = LifecycleMessage::admin(
                self::SUBJECT,
                "Checkout session {$failure->sessionId} was paid but could not be fulfilled ({$failure->reason}). Check it in Stripe and the admin queue.",
                'Open admin',
                '/admin',
            );
            if ($failure->projectId === null) {
                LifecycleMail::sendAdminAlert($message);

                return;
            }
            Audit::record('checkout_stuck', $failure->projectId, null, ['checkoutSessionId' => $failure->sessionId, 'reason' => $failure->reason]);
            LifecycleMail::sendOnce('payment_attention', $failure->projectId, $failure->sessionId, $message);
        });
    }
}
