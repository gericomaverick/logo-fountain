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

    public const UPSELL_PROJECT_MISSING = 'upsell_project_missing';

    /** DV-24 (story 5.5 AC 15): the project is no longer on the package the upgrade was bought from. */
    public const UPGRADE_STALE_FROM_PACKAGE = 'upgrade_stale_from_package';

    /** @param  array<string, mixed>|null  $audit  an extra audit payload, written under the reason's name when the project exists */
    private function __construct(public readonly string $reason, public readonly string $sessionId, public readonly ?string $projectId, public readonly ?array $audit = null)
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

    public static function upsellProjectMissing(string $sessionId): self
    {
        return new self(self::UPSELL_PROJECT_MISSING, $sessionId, null);
    }

    public static function upgradeStaleFromPackage(string $sessionId, string $projectId, string $projectPackage, string $fromPackage, string $toPackage): self
    {
        return new self(self::UPGRADE_STALE_FROM_PACKAGE, $sessionId, $projectId, [
            'checkoutSessionId' => $sessionId, 'projectPackage' => $projectPackage, 'fromPackage' => $fromPackage, 'toPackage' => $toPackage,
        ]);
    }
}
