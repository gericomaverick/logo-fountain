// K-06/K-07 fulfilment and access provisioning from a paid package session (brownfield checkout-and-payments.md
// §3 steps 6-9, §4.1-4.3), with the checkout emails N-01, N-02, N-10.
import { expect, test } from "../../fixtures";
import { extractLinks, getMessage, messagesContaining, messagesTo, SUBJECTS, waitForMessages } from "../../adapters/mail";
import {
  ADMIN_EMAIL, adminClient, adminSnapshot, auditTypes, buildEvent, checkoutStatus, deliverEvent, loadStripeFixture,
  projectsForSession, RETURNING_CUSTOMER_EMAIL, seedOnceForRun, signInSerialised,
} from "../../adapters/stripe";
import { baseURL } from "../../adapters/api";

test.beforeAll(async () => {
  await seedOnceForRun();
});

const TIERS = [
  { tier: "essential", limit: 1, total: 34900 },
  { tier: "professional", limit: 2, total: 79500 },
  { tier: "complete", limit: 3, total: 149500 },
] as const;

for (const { tier, limit } of TIERS) {
  test(`K-06,K-07,N-01,N-10 a paid ${tier} purchase creates the project with ${limit}/${limit} entitlements, a setup email and the admin email @webhook @checkout @email @api`, async () => {
    const { session, sessionId, email } = await loadStripeFixture(`package-${tier}-paid`);
    expect((await checkoutStatus(sessionId)).body).toEqual({ fulfilled: false, status: "PENDING" });

    const event = buildEvent("checkout.session.completed", session);
    const res = await deliverEvent(event);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      received: true, fulfilled: true, deduped: false, id: event.id, type: event.type,
      purchaserEmail: email, orderStatus: "FULFILLED", isReturningCustomer: false,
    });
    expect(Object.keys(res.body).sort()).toEqual(
      ["deduped", "fulfilled", "id", "isReturningCustomer", "orderStatus", "projectId", "provisionedUserId", "purchaserEmail", "received", "type"],
    );
    expect(typeof res.body.provisionedUserId).toBe("string");
    const { projectId } = res.body;

    // The success page's poll endpoint: only {fulfilled, status} (K-02).
    const status = await checkoutStatus(sessionId);
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ fulfilled: true, status: "FULFILLED" });

    const admin = await adminClient();
    const [project] = await projectsForSession(admin, sessionId);
    expect(project).toMatchObject({ id: projectId, status: "AWAITING_BRIEF", packageCode: tier, clientName: tier === "essential" ? "Ada Essential" : tier === "professional" ? "Grace Professional" : "Linus Complete", stuck: false, stuckReason: null });
    expect(project.latestOrder).toMatchObject({ status: "FULFILLED", stripeCheckoutSessionId: sessionId });

    const snapshot = await adminSnapshot(admin, projectId);
    expect(snapshot.entitlementUsage.concepts).toMatchObject({ limit, consumed: 0, reserved: 0, remaining: limit });
    expect(snapshot.entitlementUsage.revisions).toMatchObject({ limit, consumed: 0, reserved: 0, remaining: limit });
    expect(snapshot.clientContact).toEqual({ fullName: expect.any(String), email });

    const audits = await auditTypes(admin, projectId);
    for (const type of ["order_fulfilled", "state_changed", `email_sent:checkout_auth:${sessionId}`, "email_sent:admin_new_project"]) {
      expect(audits).toContain(type);
    }

    const setup = await waitForMessages(() => messagesTo(email!, SUBJECTS.setup));
    expect(setup).toHaveLength(1);
    expect(await messagesTo(email!, SUBJECTS.signIn)).toHaveLength(0);
    const links = extractLinks(await getMessage(setup[0].ID));
    const setupLink = links.find((l) => l.startsWith(`${baseURL}/set-password#`));
    expect(setupLink, links.join("\n")).toBeTruthy();
    expect(new URLSearchParams(new URL(setupLink!).hash.slice(1)).get("next")).toBe(`/project/${projectId}`);

    const adminMail = await waitForMessages(() => messagesContaining(ADMIN_EMAIL, SUBJECTS.adminNewProject, projectId));
    expect(adminMail).toHaveLength(1);
    expect(extractLinks(await getMessage(adminMail[0].ID))).toContain(`${baseURL}/admin/projects/${projectId}`);
  });
}

test("K-06,N-02 a returning customer with a password gets a sign-in link, not setup, on a new client and project @webhook @checkout @email @api", async () => {
  const startedAt = Date.now();
  // The email (typed as Client.A@Parity.Test) must match the seeded account, so only the IDs are made unique.
  const { session, sessionId } = await loadStripeFixture("purchase-returning-customer", { keepEmails: true });
  const res = await deliverEvent(buildEvent("checkout.session.completed", session));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ fulfilled: true, deduped: false, purchaserEmail: RETURNING_CUSTOMER_EMAIL, orderStatus: "FULFILLED", isReturningCustomer: true });

  const admin = await adminClient();
  const [project] = await projectsForSession(admin, sessionId);
  expect(project).toMatchObject({ packageCode: "complete", status: "AWAITING_BRIEF" });
  // Every purchase creates a new client (brownfield §4.2), so the customer now has two projects.
  const login = await signInSerialised(RETURNING_CUSTOMER_EMAIL);
  const mine = await (await login.get("/api/projects")).json();
  expect(JSON.stringify(mine)).toContain(project.id);

  const fresh = async () => (await messagesTo(RETURNING_CUSTOMER_EMAIL, SUBJECTS.signIn)).filter((m) => Date.parse(m.Created) >= startedAt - 1000);
  const signIn = await waitForMessages(fresh);
  expect(signIn).toHaveLength(1);
  expect((await messagesTo(RETURNING_CUSTOMER_EMAIL, SUBJECTS.setup)).filter((m) => Date.parse(m.Created) >= startedAt - 1000)).toHaveLength(0);
  expect(await waitForMessages(() => messagesContaining(ADMIN_EMAIL, SUBJECTS.adminNewProject, project.id))).toHaveLength(1);
});

test("K-06 a paid purchase without any customer email is NEEDS_CONTACT and provisions nobody @webhook @checkout @email @api", async () => {
  const { session, sessionId } = await loadStripeFixture("purchase-missing-email");
  const res = await deliverEvent(buildEvent("checkout.session.completed", session));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ fulfilled: true, deduped: false, purchaserEmail: null, orderStatus: "NEEDS_CONTACT", provisionedUserId: null, isReturningCustomer: false });

  // Not FULFILLED, so the success page keeps polling.
  expect((await checkoutStatus(sessionId)).body).toEqual({ fulfilled: false, status: "PENDING" });

  const admin = await adminClient();
  const [project] = await projectsForSession(admin, sessionId);
  expect(project).toMatchObject({ packageCode: "professional", status: "AWAITING_BRIEF", stuck: true, stuckReason: "Order needs contact (no purchaser email provisioned)." });
  expect(project.latestOrder.status).toBe("NEEDS_CONTACT");
  expect((await adminSnapshot(admin, project.id)).clientContact).toBeNull();
  const audits = await auditTypes(admin, project.id);
  expect(audits.some((t) => t.startsWith("email_sent:checkout_auth:"))).toBe(false);
  // The admin is still told about the new project (route.ts:198-207 runs regardless of the email).
  expect(await waitForMessages(() => messagesContaining(ADMIN_EMAIL, SUBJECTS.adminNewProject, project.id))).toHaveLength(1);
});
