<?php

namespace App\Support\Checkout;

/**
 * K-09 / DV-2 (story 5.5 AC 7, 8): the limit arithmetic of an upsell, pure and table-tested. Limits only ever go up.
 * `null` is an unlimited limit and stays null. Consumed and reserved counts are never inputs: they are not touched.
 */
final class EntitlementMath
{
    /** Extra revision: a null (or negative) limit counts as 0 before the +1 (`checkout-fulfillment.ts:221-238`). */
    public static function addon(?int $current): int
    {
        return max($current ?? 0, 0) + 1;
    }

    /**
     * DV-2, additive: current + (target tier − current tier). Next set the limit to the target tier's, losing any
     * add-on. Returns null when the limit is unlimited. The caller never passes a tier pair with a delta <= 0
     * (`isUpgrade`), so a limit never falls.
     */
    public static function upgrade(?int $current, int $fromTierLimit, int $toTierLimit): ?int
    {
        return $current === null ? null : $current + ($toTierLimit - $fromTierLimit);
    }

    /** An upgrade must move up: a zero or negative delta is never applied (critic B3). */
    public static function isUpgrade(int $fromTierLimit, int $toTierLimit): bool
    {
        return $toTierLimit > $fromTierLimit;
    }
}
