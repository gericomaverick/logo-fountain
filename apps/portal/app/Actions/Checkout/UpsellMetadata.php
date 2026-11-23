<?php

namespace App\Actions\Checkout;

/**
 * `parseUpsellMetadata` (`checkout-fulfillment.ts:74-100`): the trusted-as-far-as-the-allowlist reading of a
 * session's metadata. Anything that does not parse is not an upsell (the session then fails as "not an allowlisted
 * package", AC 11). Metadata is set by our own session creation; it is not re-checked against the line item (OQ 2).
 */
final readonly class UpsellMetadata
{
    private function __construct(
        public string $kind,
        public string $projectId,
        public ?string $addonKey,
        public ?string $fromPackage,
        public ?string $toPackage,
    ) {}

    /** @param array<string, mixed> $session */
    public static function parse(array $session): ?self
    {
        $metadata = $session['metadata'] ?? null;
        if (! is_array($metadata)) {
            return null;
        }
        $kind = CheckoutSessionData::text($metadata['kind'] ?? null);
        $projectId = CheckoutSessionData::text($metadata['projectId'] ?? null);
        if ($kind === null || $projectId === null) {
            return null;
        }
        $from = self::package($metadata['fromPackage'] ?? null);
        if ($kind === 'addon') {
            return CheckoutSessionData::text($metadata['addonKey'] ?? null) === 'extra_revision' ? new self('addon', $projectId, 'extra_revision', $from, null) : null;
        }
        $to = self::package($metadata['toPackage'] ?? null);
        if ($kind === 'upgrade' && $from !== null && $to !== null) {
            return new self('upgrade', $projectId, null, $from, $to);
        }

        return null;
    }

    private static function package(mixed $value): ?string
    {
        $text = CheckoutSessionData::text($value);

        return $text !== null && PackageEntitlements::tierLimit($text) !== null ? $text : null;
    }

    public function campaignSlug(): string
    {
        return $this->kind === 'addon' ? "addon:{$this->addonKey}" : "upgrade:{$this->fromPackage}->{$this->toPackage}";
    }
}
