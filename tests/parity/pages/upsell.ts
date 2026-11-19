// Upsell page-object interface (story 0.8b). Implementations: pages/next/upsell.ts, pages/laravel/areas-0-8b.ts.
// Fits the Next upsell panel and the Laravel one (ux-design.md §7 "Allowance exhausted", "Purchase confirmation"; J4).
import type { PackageCode } from "./index";

/** What the more-revisions prompt offers. Prices are rule copy (K-08), asserted as shown, e.g. "£95". */
export type UpsellOffer = {
  addon: { price: string } | null;
  upgrade: { to: Exclude<PackageCode, "essential">; price: string } | null;
};

export interface UpsellPages {
  /** Opens the open project's overview fresh and returns what the prompt offers, or null when no prompt is shown. */
  offer(): Promise<UpsellOffer | null>;
  /** Dismisses the prompt for now ("Not now"). Resolves once it is gone. */
  snooze(): Promise<void>;
  /** Starts buying from the prompt. Resolves on the (fake) Stripe payment page; pay with checkout.payOnFakeStripe(). */
  buy(what: "addon" | "upgrade"): Promise<void>;
  /** Back on the project after paying: waits until it reports the purchase confirmed (it polls meanwhile). */
  waitForPurchaseConfirmed(timeoutMs?: number): Promise<void>;
}
