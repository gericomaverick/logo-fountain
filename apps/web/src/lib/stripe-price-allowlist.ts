export type PackageCode = "essential" | "professional" | "complete";

export type UpsellAction =
  | { kind: "addon"; addonKey: "extra_revision"; revisionDelta: number }
  | { kind: "upgrade"; fromPackage: PackageCode; toPackage: PackageCode };

export const PACKAGE_TO_PRICE_ID: Record<PackageCode, string> = {
  // docs/stripe-price-mapping-v1.0.md
  essential: "price_1ScMRAFM0K9Qd7oX0tVHJuwB",
  professional: "price_1ScMRpFM0K9Qd7oXxcBdr8ad",
  complete: "price_1SwQmSFM0K9Qd7oX2CeIAJTa",
};

export const UPSELL_PRICE_TO_ACTION: Record<string, UpsellAction> = {
  // £49
  price_1SzFmjFM0K9Qd7oX5SrRfRvx: { kind: "addon", addonKey: "extra_revision", revisionDelta: 1 },
  // £180
  price_1SzFgSFM0K9Qd7oXRfDHdiyO: {
    kind: "upgrade",
    fromPackage: "essential",
    toPackage: "professional",
  },
  // £225
  price_1SzFiqFM0K9Qd7oX5j6yP3C0: {
    kind: "upgrade",
    fromPackage: "professional",
    toPackage: "complete",
  },
};

export function isPlaceholderPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return true;
  const normalized = priceId.trim();
  if (!normalized) return true;
  return normalized.toUpperCase().includes("REPLACE");
}

export const STRIPE_PLACEHOLDER_PRICE_IDS = [
  ...Object.entries(PACKAGE_TO_PRICE_ID)
    .filter(([, priceId]) => isPlaceholderPriceId(priceId))
    .map(([packageCode, priceId]) => ({ scope: "package", key: packageCode, priceId })),
  ...Object.entries(UPSELL_PRICE_TO_ACTION)
    .filter(([priceId]) => isPlaceholderPriceId(priceId))
    .map(([priceId, action]) => ({
      scope: action.kind,
      key: action.kind === "addon" ? action.addonKey : `${action.fromPackage}_to_${action.toPackage}`,
      priceId,
    })),
];
