// Next.js checkout: route app/checkout/start (303 to Stripe), app/checkout/success/success-processing-client.tsx.
import type { Page } from "@playwright/test";
import type { CheckoutPages } from "../index";
import { onFakeStripe, payOnFakeStripe } from "../stripe-fake";

export function checkout(page: Page): CheckoutPages {
  return {
    async start(pkg) {
      await page.goto(`/checkout/start?package_code=${pkg}`);
      await page.waitForURL(onFakeStripe);
    },
    payOnFakeStripe: (buyer) => payOnFakeStripe(page, buyer),
    async waitForConfirmation(timeoutMs = 60_000) {
      // success-processing-client.tsx:135 swaps the "Processing…" heading for this once status says fulfilled.
      await page.getByRole("heading", { name: /check your email/i }).waitFor({ timeout: timeoutMs });
    },
  };
}
