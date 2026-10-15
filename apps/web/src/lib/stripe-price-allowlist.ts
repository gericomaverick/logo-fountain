export type PackageCode = "essential" | "professional" | "complete";

export type UpsellAction =
  | { kind: "addon"; addonKey: "extra_revision"; revisionDelta: number }
  | { kind: "upgrade"; fromPackage: PackageCode; toPackage: PackageCode };

export const PACKAGE_TO_PRICE_ID: Record<PackageCode, string> = {
  // docs/stripe-price-mapping-v1.0.md
  // Updated 2026-07-01: repriced to £349 / £795 / £1,495
  essential: "price_1ToTEhFM0K9Qd7oXM0WRTWjd",
  professional: "price_1ToTFQFM0K9Qd7oXmHYwoZAT",
  complete: "price_1ToTGBFM0K9Qd7oX2D5r9Z6i",
};

export const UPSELL_PRICE_TO_ACTION: Record<string, UpsellAction> = {
  // £95
  price_1ToTbLFM0K9Qd7oXscIEu2Bt: { kind: "addon", addonKey: "extra_revision", revisionDelta: 1 },
  // £495
  price_1ToTXjFM0K9Qd7oXqfXEXy0x: {
    kind: "upgrade",
    fromPackage: "essential",
    toPackage: "professional",
  },
  // £750
  price_1ToTYMFM0K9Qd7oXBG8DOhY1: {
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
