// Laravel page objects: typed stubs until the screens exist. Each throws naming the story that builds the screen.
// Fill them in with accessible locators first; data-testid is allowed here (pages/README.md).
import type { Page } from "@playwright/test";
import type { AuthPages, CheckoutPages, PageObjects, PortalPages } from "../index";
import { onFakeStripe, payOnFakeStripe } from "../stripe-fake";
import { auth as authPages } from "./auth";
import { areas08b } from "./areas-0-8b"; // 0.8b

const todo = (what: string, story: string) => (): never => {
  throw new Error(`Laravel page object ${what}: not implemented (story ${story})`);
};

export function create(page: Page): PageObjects {
  const auth: AuthPages = authPages(page); // 4.9b
  const checkout: CheckoutPages = {
    // GET /checkout/start keeps its contract (K-01): 303 to the hosted Stripe page (routes/checkout.php:16), as Next.
    async start(pkg) {
      await page.goto(`/checkout/start?package_code=${pkg}`);
      await page.waitForURL(onFakeStripe);
    },
    // Shared infra: already real.
    payOnFakeStripe: (buyer) => payOnFakeStripe(page, buyer),
    // Checkout/Success.tsx polls status and swaps "Confirming your payment…" for "Your order is ready" once fulfilled.
    async waitForConfirmation(timeoutMs = 60_000) {
      await page.getByRole("heading", { name: /your order is ready/i }).waitFor({ timeout: timeoutMs });
    },
  };
  const portal: PortalPages = {
    openProject: todo("portal.openProject", "6.1"),
    currentProjectId: todo("portal.currentProjectId", "6.2b"),
    projectStatus: todo("portal.projectStatus", "6.2b"),
    currentTurn: todo("portal.currentTurn", "6.2b"),
  };
  return { page, auth, checkout, portal, ...areas08b(page) }; // 0.8b
}
