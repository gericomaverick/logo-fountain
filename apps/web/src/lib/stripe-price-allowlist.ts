export type PackageCode = "essential" | "professional" | "complete";

export const PACKAGE_TO_PRICE_ID: Record<PackageCode, string> = {
  // docs/stripe-price-mapping-v1.0.md
  essential: "price_1ScMRAFM0K9Qd7oX0tVHJuwB",
  professional: "price_1ScMRpFM0K9Qd7oXxcBdr8ad",
  complete: "price_1SwQmSFM0K9Qd7oX2CeIAJTa",
};

export function isPlaceholderPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return true;
  const normalized = priceId.trim();
  if (!normalized) return true;
  return normalized.toUpperCase().includes("REPLACE");
}

export const STRIPE_PLACEHOLDER_PRICE_IDS = Object.entries(PACKAGE_TO_PRICE_ID)
  .filter(([, priceId]) => isPlaceholderPriceId(priceId))
  .map(([packageCode, priceId]) => ({ packageCode: packageCode as PackageCode, priceId }));
