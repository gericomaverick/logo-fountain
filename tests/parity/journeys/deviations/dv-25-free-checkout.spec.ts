import { releaseDb } from "../../adapters/seed";
// DV-25 (owner correction 2026-11-23): a completed Checkout Session with payment_status "no_payment_required"
// (a 100%-off code) is fulfilled like a paid one: same project, entitlements and setup email. Laravel target;
// fails on Next, which refuses anything but "paid" (listed in expected-next-failures.txt).
import { expect, test } from "../../fixtures";
import { messagesTo, waitForMessages } from "../../adapters/mail";
import { buildEvent, checkoutStatus, deliverEvent, loadStripeFixture, patchSession, seedOnceForRun } from "../../adapters/stripe";

test.beforeAll(async () => {
  await seedOnceForRun();
});
test.afterAll(() => releaseDb());

test("DV-25 K-06 a 100%-off session (no_payment_required) is fulfilled like a paid one @deviation @webhook @checkout @email @api", async () => {
  const loaded = await loadStripeFixture("package-essential-paid", { sessionOverrides: { payment_status: "no_payment_required", amount_total: 0, payment_intent: null } });
  const res = await deliverEvent(buildEvent("checkout.session.completed", loaded.session));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ received: true, fulfilled: true, orderStatus: "FULFILLED" });
  // The admin project snapshot (entitlements) is not on Laravel yet (later epic); entitlements are asserted in Pest (FulfilCheckoutTest).
  const status = await checkoutStatus(loaded.sessionId);
  expect(status.status).toBe(200);
  expect(JSON.stringify(status.body)).toContain("FULFILLED");
  await waitForMessages(() => messagesTo(loaded.email!));
});

// DV-28 (owner item 3, 2026-11-23): a repeat delivery of an already-fulfilled session whose payload carries a different
// purchaser email. Next re-provisions for the payload's email (`checkout-fulfillment.ts:341-352` returns it,
// `ensureAccessProvisioning` `:453` then refuses it against the stored billing email) so the redelivery fails for a
// customer who already paid. Laravel provisions for the stored billing email and answers 200 (deduped).
test("DV-28 K-06 a repeat delivery with a different purchaser email still succeeds for the stored purchaser @deviation @webhook @checkout @api", async () => {
  const loaded = await loadStripeFixture("package-essential-paid");
  const first = await deliverEvent(buildEvent("checkout.session.completed", loaded.session));
  expect(first.status).toBe(200);
  const other = `other-${loaded.email}`;
  const patched = await patchSession(loaded, { customer_details: { ...loaded.session.customer_details, email: other } });
  const second = await deliverEvent(buildEvent("checkout.session.completed", patched));
  expect(second.status).toBe(200);
  expect(second.body).toMatchObject({ received: true, fulfilled: true, projectId: first.body.projectId });
});
