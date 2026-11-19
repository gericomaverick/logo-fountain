// Journey 18 (02-test-strategy.md §4): a purchase was paid at Stripe (stripe-fake) but its webhook never arrived.
// The admin reprocesses the Checkout Session from a stuck project's recovery area; the project and its order
// appear, and reprocessing again changes nothing (K-12). Emails are not asserted here: current Next sends none
// on reprocess, Laravel sends the customer and admin emails (DV-6, its @deviation test is story 0.8e).
import { expect, test } from "../fixtures";
import { apiClient, PARITY_PASSWORD } from "../adapters/api";
import { scenarioId, seed } from "../adapters/seed";
import { fakeDeliveries, loadStripeFixture, projectsForSession } from "../adapters/stripe";
import { adminPagesFor, pagesFor } from "../pages";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 150_000 });

test("K-12 J18 the admin reprocesses a paid checkout whose webhook never arrived; the project and order appear once @admin @ui @checkout @ops", async ({ page }) => {
  seed("admin-queue");
  const stuckProjectId = scenarioId("admin-queue", "project", "q3"); // order NEEDS_CONTACT: the workspace shows recovery
  const paid = await loadStripeFixture("package-essential-paid");
  expect(await fakeDeliveries(paid.sessionId)).toEqual([]); // no webhook was ever sent
  const api = await apiClient({ signInAs: "admin@parity.test" });
  expect(await projectsForSession(api, paid.sessionId)).toEqual([]);

  const { auth } = await pagesFor(page);
  await auth.signIn("admin@parity.test", PARITY_PASSWORD);
  const admin = await adminPagesFor(page);
  const before = (await admin.queue()).map((r) => r.projectId);

  await admin.openProject(stuckProjectId);
  expect(await admin.reprocessCheckout(paid.sessionId)).toEqual({ done: true });

  const [project] = await projectsForSession(api, paid.sessionId);
  expect(project).toMatchObject({ status: "AWAITING_BRIEF", packageCode: "essential", stuck: false, latestOrder: { status: "FULFILLED", stripeCheckoutSessionId: paid.sessionId } });
  const queue = await admin.queue();
  expect(queue.map((r) => r.projectId).filter((id) => !before.includes(id))).toEqual([project.id]);

  // Reprocessing the same session again is deduped: still one project and one order.
  await admin.openProject(stuckProjectId);
  expect(await admin.reprocessCheckout(paid.sessionId)).toEqual({ done: true });
  expect((await projectsForSession(api, paid.sessionId)).map((p) => p.id)).toEqual([project.id]);
  expect((await admin.queue()).length).toBe(queue.length);
  await api.dispose();
});
