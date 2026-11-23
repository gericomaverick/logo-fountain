<?php

namespace App\Support\Stripe;

use RuntimeException;

/** The delivery's lease marker no longer matches the ledger row: another delivery owns it (story 5.2 AC 6). */
final class WebhookClaimLost extends RuntimeException implements CodedError
{
    public function errorCode(): string
    {
        return 'WEBHOOK_CLAIM_LOST';
    }
}
