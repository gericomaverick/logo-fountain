// The stripe-fake hosted checkout page (tests/parity/infra/stripe-fake/hosted-page.mjs) is shared test infra,
// so both targets drive it the same way. Used by pages/next and pages/laravel; journeys use checkout.payOnFakeStripe().
import type { Page } from "@playwright/test";
import { baseURL } from "../adapters/api";
import { stripeFakeUrl, withMailInFlight } from "../adapters/stripe";
import type { Buyer } from "./index";

/** True once the browser is on the fake's hosted payment page. */
export const onFakeStripe = (url: URL) => url.origin === new URL(stripeFakeUrl).origin && url.pathname.startsWith("/pay/");

export async function payOnFakeStripe(page: Page, buyer: Buyer): Promise<{ sessionId: string }> {
  await page.waitForURL(onFakeStripe);
  const sessionId = decodeURIComponent(new URL(page.url()).pathname.split("/")[2] ?? "");
  await page.getByLabel("Email").fill(buyer.email);
  await page.getByLabel("First name").fill(buyer.firstName ?? "Parity");
  await page.getByLabel("Last name").fill(buyer.lastName ?? "Buyer");
  // Paying makes the fake deliver the signed webhook, which sends the app's emails: that is mail in flight.
  await withMailInFlight(async () => {
    await page.getByRole("button", { name: "Pay", exact: true }).click();
    await page.waitForURL((url) => url.origin === baseURL, { timeout: 30_000 });
  });
  return { sessionId };
}
