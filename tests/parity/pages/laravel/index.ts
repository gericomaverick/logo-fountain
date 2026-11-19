// Laravel page objects: typed stubs until the screens exist. Each throws naming the story that builds the screen.
// Fill them in with accessible locators first; data-testid is allowed here (pages/README.md).
import type { Page } from "@playwright/test";
import type { AuthPages, CheckoutPages, PageObjects, PortalPages } from "../index";
import { payOnFakeStripe } from "../stripe-fake";

const todo = (what: string, story: string) => (): never => {
  throw new Error(`Laravel page object ${what}: not implemented (story ${story})`);
};

export function create(page: Page): PageObjects {
  const auth: AuthPages = {
    signIn: todo("auth.signIn", "4.9b"),
    requestMagicLink: todo("auth.requestMagicLink", "4.9b"),
    confirmMagicLink: todo("auth.confirmMagicLink", "4.9b"),
    setPasswordFromLink: todo("auth.setPasswordFromLink", "4.9b"),
  };
  const checkout: CheckoutPages = {
    // GET /checkout/start keeps its contract (K-01), so this will likely match pages/next/checkout.ts.
    start: todo("checkout.start", "5.1"),
    // Shared infra: already real.
    payOnFakeStripe: (buyer) => payOnFakeStripe(page, buyer),
    waitForConfirmation: todo("checkout.waitForConfirmation", "5.4"),
  };
  const portal: PortalPages = {
    openProject: todo("portal.openProject", "6.1"),
    currentProjectId: todo("portal.currentProjectId", "6.2b"),
    projectStatus: todo("portal.projectStatus", "6.2b"),
    currentTurn: todo("portal.currentTurn", "6.2b"),
  };
  return { page, auth, checkout, portal };
}
