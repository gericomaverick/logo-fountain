// DV-15 (owner-approved 2026-11-19, finding F-16): webhook failures that can never succeed are permanent,
// recorded and reported to the admin instead of being retried by Stripe for ~3 days. Laravel target; each
// test fails on Next (listed in expected-next-failures.txt). Admin alert subject is part of the spec.
import { expect, test } from "../../fixtures";
import { messagesContaining, waitForMessages } from "../../adapters/mail";
import {
  ADMIN_EMAIL, adminClient, adminSnapshot, auditTypes, buildEvent, buyPackage, deliverEvent, loadStripeFixture, newRun, seedOnceForRun,
} from "../../adapters/stripe";

export const PAYMENT_ATTENTION_SUBJECT = "Payment needs attention";

test.beforeAll(async () => {
  await seedOnceForRun();
});

const permanent = { received: true, fulfilled: false, retry: false };

test("DV-15 K-05 a session Stripe does not know is a permanent failure reported to the admin @deviation @webhook @email @api", async () => {
  const loaded = await loadStripeFixture("package-essential-paid");
  const ghost = { ...loaded.session, id: `cs_test_parity_ghost_${newRun()}` };
  const res = await deliverEvent(buildEvent("checkout.session.completed", ghost));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject(permanent);
  await waitForMessages(() => messagesContaining(ADMIN_EMAIL, PAYMENT_ATTENTION_SUBJECT, ghost.id));
  // Delivered again: already processed, not retried.
  expect((await deliverEvent(buildEvent("checkout.session.completed", ghost))).status).toBe(200);
});

test("DV-15 K-06 a payment intent already used by another session is a permanent failure reported to the admin @deviation @webhook @email @api", async () => {
  const first = await buyPackage("package-essential-paid");
  const second = await loadStripeFixture("package-professional-paid", { sessionOverrides: { payment_intent: first.session.payment_intent } });
  const res = await deliverEvent(buildEvent("checkout.session.completed", second.session));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject(permanent);
  await waitForMessages(() => messagesContaining(ADMIN_EMAIL, PAYMENT_ATTENTION_SUBJECT, second.sessionId));
});

test("DV-15 K-09 an upsell paid with a different email still applies, provisions nobody new, and alerts the admin @deviation @webhook @upsell @email @api", async () => {
  const base = await buyPackage("package-essential-paid");
  const other = `someone.else.${newRun()}@example.test`;
  const upsell = await loadStripeFixture("upsell-addon-extra-revision", {
    run: base.run, vars: { projectId: base.projectId },
    sessionOverrides: { customer_details: { email: other, name: "Someone Else" } },
  });
  const res = await deliverEvent(buildEvent("checkout.session.completed", upsell.session));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ fulfilled: true, projectId: base.projectId });
  const admin = await adminClient();
  expect((await adminSnapshot(admin, base.projectId)).entitlementUsage.revisions.limit).toBe(2);
  expect(await auditTypes(admin, base.projectId)).toContain("upsell_buyer_email_mismatch");
  await waitForMessages(() => messagesContaining(ADMIN_EMAIL, PAYMENT_ATTENTION_SUBJECT, upsell.sessionId));
});
