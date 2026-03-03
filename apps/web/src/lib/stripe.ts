import "server-only";

import Stripe from "stripe";

import {
  PACKAGE_TO_PRICE_ID,
  STRIPE_PLACEHOLDER_PRICE_IDS,
  UPSELL_PRICE_TO_ACTION,
  type PackageCode,
  type UpsellAction,
} from "@/lib/stripe-price-allowlist";

export { PACKAGE_TO_PRICE_ID, STRIPE_PLACEHOLDER_PRICE_IDS, UPSELL_PRICE_TO_ACTION };
export type { PackageCode, UpsellAction };

export const PRICE_ID_TO_PACKAGE: Record<string, PackageCode> = Object.fromEntries(
  Object.entries(PACKAGE_TO_PRICE_ID).map(([packageCode, priceId]) => [priceId, packageCode as PackageCode])
);

if (STRIPE_PLACEHOLDER_PRICE_IDS.length > 0) {
  console.error(
    "[stripe] Placeholder Stripe price IDs detected in PACKAGE_TO_PRICE_ID:",
    STRIPE_PLACEHOLDER_PRICE_IDS
  );
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const stripe = new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2026-02-25.clover",
});
