import { releaseDb } from "../../adapters/seed";
// DV-25 (owner correction 2026-11-23): a completed Checkout Session with payment_status "no_payment_required"
// (a 100%-off code) is fulfilled like a paid one: same project, entitlements and setup email. Laravel target;
// fails on Next, which refuses anything but "paid" (listed in expected-next-failures.txt).
import { expect, test } from "../../fixtures";
import { messagesTo, waitForMessages } from "../../adapters/mail";
import { adminClient, adminSnapshot, buildEvent, deliverEvent, loadStripeFixture, seedOnceForRun } from "../../adapters/stripe";

test.beforeAll(async () => {
  await seedOnceForRun();
});
test.afterAll(() => releaseDb());

test("DV-25 K-06 a 100%-off session (no_payment_required) is fulfilled like a paid one @deviation @webhook @checkout @email @api", async () => {
  const loaded = await loadStripeFixture("package-essential-paid", { sessionOverrides: { payment_status: "no_payment_required", amount_total: 0, payment_intent: null } });
  const res = await deliverEvent(buildEvent("checkout.session.completed", loaded.session));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ received: true, fulfilled: true, orderStatus: "FULFILLED" });
  const admin = await adminClient();
  const snapshot = await adminSnapshot(admin, res.body.projectId);
  expect(snapshot.entitlementUsage.revisions.limit).toBeGreaterThan(0);
  await waitForMessages(() => messagesTo(loaded.email!));
});
