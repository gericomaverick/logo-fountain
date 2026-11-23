<?php

namespace App\Support\Stripe;

/**
 * Package code → Stripe price ID (K-01), from config/catalog.php. `lib/stripe-price-allowlist.ts:10-15,44-55`.
 * Story 5.5 adds the upsell map here.
 */
final readonly class StripeCatalog
{
    /** @param  array<string, array{price_id: string|null, display_price: string}>  $packages */
    public function __construct(private array $packages) {}

    public static function fromConfig(): self
    {
        /** @var array<string, array{price_id: string|null, display_price: string}> $packages */
        $packages = config('catalog.packages', []);

        return new self($packages);
    }

    /** @return list<string> the codes a caller may send, in display order */
    public function packageCodes(): array
    {
        return array_keys($this->packages);
    }

    /** Exact, case-sensitive match (`checkout/start/route.ts:7-10`); anything else, a price ID included, is null. */
    public function priceIdForPackage(?string $code): ?string
    {
        if ($code === null || ! isset($this->packages[$code])) {
            return null;
        }

        return $this->packages[$code]['price_id'];
    }

    /** `isPlaceholderPriceId` (`stripe-price-allowlist.ts:42-47`): empty, or containing REPLACE. */
    public static function isPlaceholder(?string $priceId): bool
    {
        $normalized = trim((string) $priceId);

        return $normalized === '' || str_contains(strtoupper($normalized), 'REPLACE');
    }

    /** @return list<array{scope: string, key: string, priceId: string|null}> */
    public function placeholders(): array
    {
        $found = [];
        foreach ($this->packages as $code => $row) {
            if (self::isPlaceholder($row['price_id'])) {
                $found[] = ['scope' => 'package', 'key' => $code, 'priceId' => $row['price_id']];
            }
        }

        return $found;
    }
}
