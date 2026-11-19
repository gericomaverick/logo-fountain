// Journey 6 (02-test-strategy.md §4, ux-design.md §7 "Allowance exhausted", J4): with every revision used, the
// project offers an add-on and an upgrade with their prices -> pay on the stripe-fake hosted page (it posts the signed
// webhook) -> back on the project the purchase banner polls until confirmed -> the allowance grows -> "Not now" hides
// the prompt. Upgrade semantics asserted here are Next's CURRENT ones (limits SET to the target tier, K-09); on these
// scenarios the additive DV-2 maths gives the same numbers, and DV-2's distinguishing case belongs to story 0.8e.
import { expect, test } from "../fixtures";
import { PARITY_PASSWORD } from "../adapters/api";
import { seed } from "../adapters/seed";
import { fulfilledProjectId } from "../adapters/stripe";
import { pagesFor } from "../pages";

const CLIENT = "client.a@parity.test";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 180_000 });

test("C-04/K-08/K-09/K-10 J6 revisions exhausted: buy the extra revision, the banner confirms it, the allowance grows and Not now hides the prompt @ui @upsell @revisions", async ({ page }) => {
  seed("revisions-exhausted"); // Essential, 1 revision, used
  const { auth, portal, checkout, concepts, upsell } = await pagesFor(page);
  await auth.signIn(CLIENT, PARITY_PASSWORD);
  await portal.openProject();
  const projectId = await portal.currentProjectId();
  expect(await concepts.allowance("revisions")).toEqual({ limit: 1, used: 1, pending: 0, left: 0 });

  // C-04/K-08: nothing left -> the add-on, plus the upgrade (headroom is low), at the allow-listed prices.
  expect(await upsell.offer()).toEqual({ addon: { price: "£95" }, upgrade: { to: "professional", price: "£495" } });

  await upsell.buy("addon");
  const { sessionId } = await checkout.payOnFakeStripe({ email: CLIENT, firstName: "Ada", lastName: "Client" });
  // K-10: back on the project, the banner polls the purchase status until the webhook has been processed.
  expect(await portal.currentProjectId()).toBe(projectId);
  await upsell.waitForPurchaseConfirmed();
  expect(await fulfilledProjectId(sessionId)).toBe(projectId);

  // K-09: +1 revision limit; used stays used.
  expect(await concepts.allowance("revisions")).toEqual({ limit: 2, used: 1, pending: 0, left: 1 });
  // C-04: one left -> no add-on, but the upgrade is still offered.
  expect(await upsell.offer()).toEqual({ addon: null, upgrade: { to: "professional", price: "£495" } });

  // C-04: "Not now" hides the prompt, and it stays hidden when the project is opened again.
  await upsell.snooze();
  expect(await upsell.offer()).toBeNull();
});

test("C-04/K-08/K-09/K-10 J6 revisions exhausted: upgrade Essential to Professional, the banner confirms it, the limits become Professional's and Not now hides the prompt @ui @upsell @revisions", async ({ page }) => {
  seed("revisions-exhausted"); // Essential: concepts 1 (used), revisions 1 (used)
  const { auth, portal, checkout, concepts, upsell } = await pagesFor(page);
  await auth.signIn(CLIENT, PARITY_PASSWORD);
  await portal.openProject();
  const projectId = await portal.currentProjectId();
  expect(await upsell.offer()).toEqual({ addon: { price: "£95" }, upgrade: { to: "professional", price: "£495" } });

  await upsell.buy("upgrade");
  const { sessionId } = await checkout.payOnFakeStripe({ email: CLIENT, firstName: "Ada", lastName: "Client" });
  expect(await portal.currentProjectId()).toBe(projectId);
  await upsell.waitForPurchaseConfirmed();
  expect(await fulfilledProjectId(sessionId)).toBe(projectId);

  // K-09 (Next today): the limits are set to Professional's (2/2); used counts are kept.
  expect(await concepts.allowance("revisions")).toEqual({ limit: 2, used: 1, pending: 0, left: 1 });
  expect(await concepts.allowance("concepts")).toEqual({ limit: 2, used: 1, pending: 0, left: 1 });
  expect((await (await page.request.get(`/api/projects/${projectId}`)).json()).snapshot.packageCode).toBe("professional");

  // C-04: one revision left on Professional -> the next upgrade (Complete) is offered, no add-on.
  expect(await upsell.offer()).toEqual({ addon: null, upgrade: { to: "complete", price: "£750" } });
  await upsell.snooze();
  expect(await upsell.offer()).toBeNull();
});
