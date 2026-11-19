import { releaseDb } from "../../adapters/seed";
// K-09 upsell fulfilment through the webhook (brownfield checkout-and-payments.md §4.4), CURRENT Next behaviour:
// an add-on adds 1 revision; an upgrade SETS the limits to the target tier. (DV-2 deviation tests: story 0.8e.)
import { expect, test } from "../../fixtures";
import { messagesContaining, messagesTo, SUBJECTS, waitForMessages } from "../../adapters/mail";
import {
  ADMIN_EMAIL, adminClient, adminSnapshot, auditEvents, buildEvent, buyPackage, deliverEvent, loadStripeFixture, seedOnceForRun,
} from "../../adapters/stripe";

test.beforeAll(async () => {
  await seedOnceForRun();
});
// Hand the file-wide shared lease back as soon as this worker is done with the file (story 0.9).
test.afterAll(() => releaseDb());

async function limits(projectId: string) {
  const snapshot = await adminSnapshot(await adminClient(), projectId);
  return { packageCode: snapshot.packageCode, concepts: snapshot.entitlementUsage.concepts.limit, revisions: snapshot.entitlementUsage.revisions.limit, latestSession: snapshot.latestOrder?.stripeCheckoutSessionId };
}

test("K-09 an extra-revision add-on adds one revision, once, and sends no new-project email @webhook @upsell @email @api", async () => {
  const base = await buyPackage("package-essential-paid");
  const upsell = await loadStripeFixture("upsell-addon-extra-revision", { run: base.run, vars: { projectId: base.projectId } });
  expect(upsell.email).toBe(base.email); // same buyer, as the upsell checkout is started from the project

  const event = buildEvent("checkout.session.completed", upsell.session);
  const res = await deliverEvent(event);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ fulfilled: true, deduped: false, projectId: base.projectId, orderStatus: "FULFILLED", isReturningCustomer: true });
  expect(await limits(base.projectId)).toEqual({ packageCode: "essential", concepts: 1, revisions: 2, latestSession: upsell.sessionId });

  // A new event for the same session must not add a second revision (dedupe on session or payment intent).
  const again = await deliverEvent(buildEvent("checkout.session.completed", upsell.session));
  expect(again.body).toMatchObject({ fulfilled: true, deduped: true });
  expect((await limits(base.projectId)).revisions).toBe(2);

  const audits = await auditEvents(await adminClient(), base.projectId);
  const addon = audits.filter((e) => e.type === "entitlement_addon_applied");
  expect(addon).toHaveLength(1);
  expect(addon[0].payload).toMatchObject({ checkoutSessionId: upsell.sessionId, addonKey: "extra_revision", revisionDelta: 1 });
  expect(audits.find((e) => e.type === "order_fulfilled" && e.payload?.kind === "addon")).toBeTruthy();

  // Current behaviour: the buyer (still without a password) gets a second setup email for the upsell session;
  // the admin new-project email is only sent for the original purchase.
  expect(await waitForMessages(() => messagesTo(base.email!, SUBJECTS.setup), { count: 2 })).toHaveLength(2);
  expect(await waitForMessages(() => messagesContaining(ADMIN_EMAIL, SUBJECTS.adminNewProject, base.projectId))).toHaveLength(1);
});

for (const { from, to, fixture, limit } of [
  { from: "essential", to: "professional", fixture: "upsell-upgrade-essential-professional", limit: 2 },
  { from: "professional", to: "complete", fixture: "upsell-upgrade-professional-complete", limit: 3 },
] as const) {
  test(`K-09 an upgrade ${from} to ${to} sets the ${to} limits and package @webhook @upsell @api`, async () => {
    const base = await buyPackage(`package-${from}-paid`);
    const upsell = await loadStripeFixture(fixture, { run: base.run, vars: { projectId: base.projectId } });
    const res = await deliverEvent(buildEvent("checkout.session.completed", upsell.session));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fulfilled: true, deduped: false, projectId: base.projectId });
    expect(await limits(base.projectId)).toEqual({ packageCode: to, concepts: limit, revisions: limit, latestSession: upsell.sessionId });

    const audits = await auditEvents(await adminClient(), base.projectId);
    expect(audits.find((e) => e.type === "package_upgrade_applied")?.payload).toMatchObject({ checkoutSessionId: upsell.sessionId, fromPackage: from, toPackage: to });
    expect(audits.find((e) => e.type === "order_fulfilled" && e.payload?.kind === "upgrade")).toBeTruthy();
  });
}
