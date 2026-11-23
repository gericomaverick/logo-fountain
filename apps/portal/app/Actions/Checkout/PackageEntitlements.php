<?php

namespace App\Actions\Checkout;

/**
 * K-07: the entitlements a package grants (`checkout-fulfillment.ts:20-31`). The one place; story 5.5's upgrade
 * maths (DV-2) reads it too.
 */
final class PackageEntitlements
{
    private const LIMITS = ['essential' => 1, 'professional' => 2, 'complete' => 3];

    /** @return list<array{key: string, limit: int}> */
    public static function for(string $packageCode): array
    {
        $limit = self::LIMITS[$packageCode];

        return [['key' => 'concepts', 'limit' => $limit], ['key' => 'revisions', 'limit' => $limit]];
    }

    /** The tier's limit (concepts and revisions share it); null for a code that is not a package. */
    public static function tierLimit(string $packageCode): ?int
    {
        return self::LIMITS[$packageCode] ?? null;
    }
}
