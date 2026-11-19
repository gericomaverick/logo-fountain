import { releaseDb } from "../../adapters/seed";
// K-05 payment states and permanent errors: unpaid, delayed success (fresh retrieve) or failure, and sessions
// that don't resolve to exactly one allowlisted package (brownfield checkout-and-payments.md §3 steps 2, 4, 10; §4.1-4.2).
import { expect, test } from "../../fixtures";
import { messagesTo, SUBJECTS, waitForMessages } from "../../adapters/mail";
import {
  adminClient, buildEvent, checkoutStatus, deliverEvent, loadStripeFixture, patchSession, projectsForSession, seedOnceForRun,
} from "../../adapters/stripe";

test.beforeAll(async () => {
  await seedOnceForRun();
});
// Hand the file-wide shared lease back as soon as this worker is done with the file (story 0.9).
test.afterAll(() => releaseDb());

const PERMANENT = { received: true, fulfilled: false, error: "Webhook processing failed", classification: "permanent", retry: false };

test("K-05 an unpaid completed session is not fulfilled and the event is marked processed @webhook @checkout @api", async () => {
  const { session, sessionId, email } = await loadStripeFixture("purchase-unpaid");
  expect(session.payment_status).toBe("unpaid");
  const event = buildEvent("checkout.session.completed", session);

  const res = await deliverEvent(event);
  expect(res.status).toBe(200);
  expect(res.body).toEqual(PERMANENT);
  expect((await deliverEvent(event)).body).toEqual({ received: true, deduped: true, id: event.id, type: event.type });

  expect((await checkoutStatus(sessionId)).body).toEqual({ fulfilled: false, status: "PENDING" });
  expect(await projectsForSession(await adminClient(), sessionId)).toHaveLength(0);
  expect(await messagesTo(email!, SUBJECTS.setup)).toHaveLength(0);
});

test("K-05 a delayed payment that succeeds later is fulfilled from a fresh session retrieve @webhook @checkout @email @api", async () => {
  const loaded = await loadStripeFixture("purchase-unpaid");
  const stalePayload = loaded.session; // payment_status "unpaid", as in the original completed event
  expect((await deliverEvent(buildEvent("checkout.session.completed", stalePayload))).body).toEqual(PERMANENT);

  // Stripe later settles the payment. The async_payment_succeeded payload here is deliberately the stale
  // unpaid object: the handler must re-read the session from Stripe (route.ts:144) rather than trust it.
  await patchSession(loaded, { payment_status: "paid" });
  const event = buildEvent("checkout.session.async_payment_succeeded", stalePayload);
  const res = await deliverEvent(event);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ fulfilled: true, deduped: false, type: "checkout.session.async_payment_succeeded", orderStatus: "FULFILLED", purchaserEmail: loaded.email });

  expect((await checkoutStatus(loaded.sessionId)).body).toEqual({ fulfilled: true, status: "FULFILLED" });
  const [project] = await projectsForSession(await adminClient(), loaded.sessionId);
  expect(project).toMatchObject({ id: res.body.projectId, packageCode: "essential", status: "AWAITING_BRIEF" });
  expect(await waitForMessages(() => messagesTo(loaded.email!, SUBJECTS.setup))).toHaveLength(1);
});

test("K-05 a delayed payment that fails is recorded without fulfilment @webhook @checkout @api", async () => {
  const { session, sessionId, email } = await loadStripeFixture("purchase-unpaid");
  expect((await deliverEvent(buildEvent("checkout.session.completed", session))).body).toEqual(PERMANENT);

  const event = buildEvent("checkout.session.async_payment_failed", session);
  const res = await deliverEvent(event);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ received: true, paymentFailed: true, id: event.id, type: event.type });
  // Not a fulfilment event, so it isn't deduped: a redelivery gets the same answer (upsert, route.ts:58).
  expect((await deliverEvent(event)).body).toEqual({ received: true, paymentFailed: true, id: event.id, type: event.type });

  expect((await checkoutStatus(sessionId)).body).toEqual({ fulfilled: false, status: "PENDING" });
  expect(await projectsForSession(await adminClient(), sessionId)).toHaveLength(0);
  expect(await messagesTo(email!, SUBJECTS.setup)).toHaveLength(0);
});

for (const [fixture, what] of [
  ["purchase-multi-line-item", "two package line items"],
  ["purchase-non-allowlisted-price", "a non-allowlisted price (metadata.package_code is ignored)"],
] as const) {
  test(`K-05 a paid session with ${what} is a permanent error and is marked processed @webhook @checkout @api`, async () => {
    const { session, sessionId, email } = await loadStripeFixture(fixture);
    const event = buildEvent("checkout.session.completed", session);
    const res = await deliverEvent(event);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(PERMANENT);
    expect((await deliverEvent(event)).body).toEqual({ received: true, deduped: true, id: event.id, type: event.type });

    expect((await checkoutStatus(sessionId)).body).toEqual({ fulfilled: false, status: "PENDING" });
    expect(await projectsForSession(await adminClient(), sessionId)).toHaveLength(0);
    expect(await messagesTo(email!, SUBJECTS.setup)).toHaveLength(0);
  });
}
