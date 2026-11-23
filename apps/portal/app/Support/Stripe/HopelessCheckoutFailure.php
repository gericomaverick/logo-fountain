<?php

namespace App\Support\Stripe;

use RuntimeException;

/**
 * DV-15 / DV-21: a failure no retry can cure. Permanent, and the admin is told once (story 5.2 AC 11, 12).
 * `$projectId` is set only when the project exists (the audit row has a foreign key to it).
 */
final class HopelessCheckoutFailure extends RuntimeException
{
    public const UNKNOWN_SESSION = 'unknown_session';

    public const PAYMENT_INTENT_REUSED = 'payment_intent_reused';

    public const NO_PAYMENT_REQUIRED = 'no_payment_required';

    public const UPSELL_PROJECT_MISSING = 'upsell_project_missing';

    private function __construct(public readonly string $reason, public readonly string $sessionId, public readonly ?string $projectId)
    {
        parent::__construct("Checkout session cannot be fulfilled ({$reason})");
    }

    public static function unknownSession(string $sessionId): self
    {
        return new self(self::UNKNOWN_SESSION, $sessionId, null);
    }

    public static function paymentIntentReused(string $sessionId, ?string $projectId = null): self
    {
        return new self(self::PAYMENT_INTENT_REUSED, $sessionId, $projectId);
    }

    /** DV-25: a fully discounted session is never fulfilled silently (story 5.3 AC 1). */
    public static function noPaymentRequired(string $sessionId): self
    {
        return new self(self::NO_PAYMENT_REQUIRED, $sessionId, null);
    }

    public static function upsellProjectMissing(string $sessionId): self
    {
        return new self(self::UPSELL_PROJECT_MISSING, $sessionId, null);
    }
}
