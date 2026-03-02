import "server-only";

import Stripe from "stripe";

export type PackageCode = "essential" | "professional" | "complete";

export const PACKAGE_TO_PRICE_ID: Record<PackageCode, string> = {
  // docs/stripe-price-mapping-v1.0.md
  essential: "price_REPLACE_ESSENTIAL",
  professional: "price_1ScMRpFM0K9Qd7oXxcBdr8ad",
  complete: "price_1SwQmSFM0K9Qd7oX2CeIAJTa",
};

export const PRICE_ID_TO_PACKAGE: Record<string, PackageCode> = Object.fromEntries(
  Object.entries(PACKAGE_TO_PRICE_ID).map(([packageCode, priceId]) => [priceId, packageCode as PackageCode])
);

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const stripe = new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2026-02-25.clover",
});
