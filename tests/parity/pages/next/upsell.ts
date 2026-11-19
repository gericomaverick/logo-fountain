// Next.js upsell: the panel and the purchase status banner on the hub (app/project/[id]/project-hub.tsx:88-218),
// buttons and snooze from components/revision-purchase.tsx.
import type { Page } from "@playwright/test";
import type { UpsellOffer, UpsellPages } from "../upsell";
import { onFakeStripe } from "../stripe-fake";
import { openHub } from "./project-areas";

export function upsell(page: Page): UpsellPages {
  // project-hub.tsx:113-116: the panel is the section headed "Need more flexibility?". (The allowances card's
  // "Need more?" footer, revision-purchase.tsx:173, always offers the same purchases and can't be snoozed.)
  const panel = () => page.locator("section").filter({ has: page.getByRole("heading", { name: "Need more flexibility?" }) });
  const addonButton = () => panel().getByRole("button", { name: /^Buy extra revision \(/ });
  const upgradeButton = () => panel().getByRole("button", { name: /^Upgrade to / });

  return {
    async offer() {
      await openHub(page);
      if ((await panel().count()) === 0) return null;
      const offer: UpsellOffer = { addon: null, upgrade: null };
      if (await addonButton().count()) {
        offer.addon = { price: (await addonButton().innerText()).match(/\((.+)\)$/)![1] };
      }
      if (await upgradeButton().count()) {
        const m = (await upgradeButton().innerText()).match(/^Upgrade to (Professional|Complete) \((.+)\)$/)!;
        offer.upgrade = { to: m[1] === "Professional" ? "professional" : "complete", price: m[2] };
      }
      return offer;
    },
    async snooze() {
      await panel().getByRole("button", { name: "Not now" }).click();
      await panel().waitFor({ state: "detached" });
    },
    async buy(what) {
      // useRevisionPurchase (revision-purchase.tsx:126) POSTs checkout/session, then location.assign(url).
      await (what === "addon" ? addonButton() : upgradeButton()).click();
      await page.waitForURL(onFakeStripe, { timeout: 30_000 });
    },
    async waitForPurchaseConfirmed(timeoutMs = 60_000) {
      // project-hub.tsx:155 UpsellPurchaseStatus polls /api/checkout/status (2.5 s, then 7 s) until fulfilled.
      await page.getByText("Purchase confirmed", { exact: true }).waitFor({ timeout: timeoutMs });
    },
  };
}
