import { releaseDb } from "../../adapters/seed";
// K-05 webhook ledger: signature, dedupe, concurrent duplicates, transient failure + retry (brownfield
// checkout-and-payments.md §3). Assertions go through the webhook response, GET /api/checkout/status,
// admin GET /api/admin/projects and Mailpit only.
import { expect, test } from "../../fixtures";
import { messagesContaining, messagesTo, SUBJECTS, waitForMessages } from "../../adapters/mail";
import {
  ADMIN_EMAIL, adminClient, buildEvent, checkoutStatus, deliverEvent, failNextEmailSends, loadStripeFixture,
  projectsForSession, seedOnceForRun, signPayload, withEmailFailures,
} from "../../adapters/stripe";

test.beforeAll(async () => {
  await seedOnceForRun();
});
// Hand the file-wide shared lease back as soon as this worker is done with the file (story 0.9).
test.afterAll(() => releaseDb());

const adminNewProjectMails = (projectId: string) => () => messagesContaining(ADMIN_EMAIL, SUBJECTS.adminNewProject, projectId);

test("K-05 a missing or bad Stripe-Signature is rejected with 400 and nothing is fulfilled @webhook @api", async () => {
  const { session, sessionId } = await loadStripeFixture("package-essential-paid");
  const event = buildEvent("checkout.session.completed", session);

  const missing = await deliverEvent(event, { signature: null });
  expect(missing.status).toBe(400);
  expect(missing.text).toBe("Missing stripe-signature header");

  const wrongSecret = await deliverEvent(event, { secret: "whsec_wrong_secret" });
  expect(wrongSecret.status).toBe(400);
  expect(wrongSecret.text).toMatch(/^Webhook signature verification failed: /);

  // A valid signature over a different body (tampered payload).
  const tampered = await deliverEvent(event, { signature: signPayload(JSON.stringify({ ...event, id: "evt_other" })) });
  expect(tampered.status).toBe(400);

  const stale = await deliverEvent(event, { signature: signPayload(JSON.stringify(event, null, 2), undefined, Math.floor(Date.now() / 1000) - 3600) });
  expect(stale.status).toBe(400); // outside the SDK's 300 s tolerance

  expect((await checkoutStatus(sessionId)).body).toEqual({ fulfilled: false, status: "PENDING" });
});

test("K-05 a second delivery of the same event is deduped and sends no second email @webhook @email @api", async () => {
  const { session, sessionId, email } = await loadStripeFixture("package-essential-paid");
  const event = buildEvent("checkout.session.completed", session);

  const first = await deliverEvent(event);
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ received: true, fulfilled: true, deduped: false, id: event.id, type: event.type });

  const second = await deliverEvent(event);
  expect(second.status).toBe(200);
  expect(second.body).toEqual({ received: true, deduped: true, id: event.id, type: event.type });

  const admin = await adminClient();
  expect(await projectsForSession(admin, sessionId)).toHaveLength(1);
  expect(await waitForMessages(() => messagesTo(email!, SUBJECTS.setup))).toHaveLength(1);
  expect(await waitForMessages(adminNewProjectMails(first.body.projectId))).toHaveLength(1);
});

test("K-05 a different event for an already fulfilled session reuses the order and sends no second email @webhook @email @api", async () => {
  const { session, sessionId, email } = await loadStripeFixture("package-professional-paid");
  const first = await deliverEvent(buildEvent("checkout.session.completed", session));
  expect(first.body).toMatchObject({ fulfilled: true, deduped: false });

  // Stripe can emit a new event ID for the same session (e.g. a replay from the dashboard).
  const again = await deliverEvent(buildEvent("checkout.session.completed", session));
  expect(again.status).toBe(200);
  expect(again.body).toMatchObject({ received: true, fulfilled: true, deduped: true, projectId: first.body.projectId });

  const admin = await adminClient();
  expect(await projectsForSession(admin, sessionId)).toHaveLength(1);
  expect(await waitForMessages(() => messagesTo(email!, SUBJECTS.setup))).toHaveLength(1);
  expect(await waitForMessages(adminNewProjectMails(first.body.projectId))).toHaveLength(1);
});

test("K-05 concurrent duplicate deliveries produce exactly one fulfilment @webhook @email @api", async () => {
  const { session, sessionId, email } = await loadStripeFixture("package-complete-paid");
  const event = buildEvent("checkout.session.completed", session);

  const results = await Promise.all(Array.from({ length: 6 }, () => deliverEvent(event)));
  const fulfilled = results.filter((r) => r.status === 200 && r.body?.fulfilled === true);
  expect(fulfilled).toHaveLength(1);
  for (const r of results.filter((x) => x !== fulfilled[0])) {
    // Losers either saw the live claim (409, Stripe retries) or, if they arrived after completion, the ledger.
    expect([409, 200]).toContain(r.status);
    if (r.status === 409) expect(r.body).toEqual({ received: true, inFlight: true, retry: true, id: event.id, type: event.type });
    else expect(r.body).toEqual({ received: true, deduped: true, id: event.id, type: event.type });
  }

  // Stripe's retry of a 409 lands after completion and is deduped.
  expect((await deliverEvent(event)).body).toMatchObject({ deduped: true });

  const admin = await adminClient();
  expect(await projectsForSession(admin, sessionId)).toHaveLength(1);
  expect(await waitForMessages(() => messagesTo(email!, SUBJECTS.setup))).toHaveLength(1);
  expect(await waitForMessages(adminNewProjectMails(fulfilled[0].body.projectId))).toHaveLength(1);
});

test("K-05 events other than checkout fulfilment are acknowledged and ignored @webhook @api", async () => {
  const event = buildEvent("payment_intent.succeeded", { id: "pi_parity_ignored", object: "payment_intent" });
  const res = await deliverEvent(event);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ received: true, ignored: true, id: event.id, type: event.type });
});

test("K-05 a session unknown to Stripe is a transient failure; the retry of the same event fulfils it @webhook @api", async () => {
  // Line items can't be listed (Stripe 404 / outage) before anything is written: the claim is released.
  const { session, sessionId, run } = await loadStripeFixture("package-essential-paid");
  const ghost = { ...session, id: `${sessionId}_ghost` };
  const event = buildEvent("checkout.session.completed", ghost);

  const failed = await deliverEvent(event);
  expect(failed.status).toBe(500);
  expect(failed.body).toEqual({ received: true, fulfilled: false, error: "Webhook processing failed", classification: "transient", retry: true });
  expect((await checkoutStatus(ghost.id)).body.status).toBe("PENDING");

  // The session becomes retrievable; Stripe redelivers the SAME event ID.
  await loadStripeFixture("package-essential-paid", { run, sessionOverrides: { id: ghost.id } });
  const retried = await deliverEvent(event);
  expect(retried.status).toBe(200);
  expect(retried.body).toMatchObject({ fulfilled: true, deduped: false });
  expect((await checkoutStatus(ghost.id)).body).toEqual({ fulfilled: true, status: "FULFILLED" });
});

test("K-05,K-06 a failed checkout email after fulfilment is retried: one order, one setup email, one admin email @webhook @email @api", async () => {
  const { session, sessionId, email } = await loadStripeFixture("package-essential-paid");
  const event = buildEvent("checkout.session.completed", session);

  const failed = await withEmailFailures(async () => {
    await failNextEmailSends(1); // the customer setup email is the first send (route.ts:174)
    return deliverEvent(event);
  });
  expect(failed.status).toBe(500);
  expect(failed.body).toEqual({ received: true, fulfilled: false, error: "Webhook processing failed", classification: "transient", retry: true });
  // Fulfilment is durable before the email step, so the order already reads as fulfilled.
  expect((await checkoutStatus(sessionId)).body).toEqual({ fulfilled: true, status: "FULFILLED" });
  expect(await messagesTo(email!, SUBJECTS.setup)).toHaveLength(0);

  const retried = await deliverEvent(event); // same event ID: the claim was released
  expect(retried.status).toBe(200);
  expect(retried.body).toMatchObject({ fulfilled: true, deduped: true, orderStatus: "FULFILLED", purchaserEmail: email });

  expect((await deliverEvent(event)).body).toMatchObject({ deduped: true });
  const admin = await adminClient();
  expect(await projectsForSession(admin, sessionId)).toHaveLength(1);
  expect(await waitForMessages(() => messagesTo(email!, SUBJECTS.setup))).toHaveLength(1);
  expect(await waitForMessages(adminNewProjectMails(retried.body.projectId))).toHaveLength(1);
});
