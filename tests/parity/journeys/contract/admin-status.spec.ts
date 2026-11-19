// POST /api/admin/projects/{id}/status (brownfield/api-admin.md "Status changes"; D-03).
import { buildEvent, deliverEvent, loadStripeFixture } from "../../adapters/stripe";
import { CLIENT_A, UNKNOWN_ID, api, auditEvents, expect, expectError, expectOk, snapshot, test } from "./_admin-helpers";

test.describe.configure({ mode: "default" });

const post = (ctx: any, p: string, data: unknown) => ctx.post(api(p, "/status"), { data });

test("D-03 status validation: MISSING_STATUS, DOMAIN_ACTION_REQUIRED, REASON_REQUIRED, 404 @admin @api @state", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  await expectError(await post(s.admin, p, {}), 400, "MISSING_STATUS");
  await expectError(await post(s.admin, p, { status: "   ", reason: "x" }), 400, "MISSING_STATUS");
  for (const status of ["REFUNDED", "CONCEPTS_READY", "DELIVERED", "on_hold"]) {
    await expectError(await post(s.admin, p, { status, reason: "Lifecycle shortcut" }), 400, "DOMAIN_ACTION_REQUIRED");
  }
  await expectError(await post(s.admin, p, { status: "ON_HOLD" }), 400, "REASON_REQUIRED");
  await expectError(await post(s.admin, p, { status: "ON_HOLD", reason: "   " }), 400, "REASON_REQUIRED");
  await expectError(await post(s.admin, p, { status: "ON_HOLD", reason: "x".repeat(501) }), 400, "REASON_REQUIRED");
  await expectError(await post(s.admin, UNKNOWN_ID, { status: "ON_HOLD", reason: "Waiting" }), 404, "PROJECT_NOT_FOUND");
  // Validation precedes the project lookup.
  await expectError(await post(s.admin, UNKNOWN_ID, { status: "REFUNDED", reason: "x" }), 400, "DOMAIN_ACTION_REQUIRED");
  expect((await snapshot(s.admin, p)).status).toBe("CONCEPTS_READY");
});

test("D-03 ON_HOLD then RESUME restores the recorded phase with audited state changes @admin @api @state @audit", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  const held = await expectOk(await post(s.admin, p, { status: "ON_HOLD", reason: "  Waiting for trademark check  " }));
  expect(held).toEqual({ ok: true, project: { id: p, status: "ON_HOLD" } });
  const version = (await snapshot(s.admin, p)).updatedAt;
  const [hold] = await auditEvents(s.admin, p, "state_changed");
  expect(hold.payload).toEqual({
    previousStatus: "CONCEPTS_READY",
    nextStatus: "ON_HOLD",
    reason: "Waiting for trademark check",
    source: "constrained_admin_exception",
    heldVersion: version,
  });
  expect(hold.actor.email).toBe("admin@parity.test");

  const resumed = await expectOk(await post(s.admin, p, { status: "RESUME", reason: "Trademark cleared" }));
  expect(resumed).toEqual({ ok: true, project: { id: p, status: "CONCEPTS_READY" } });
  const [resume] = await auditEvents(s.admin, p, "state_changed");
  expect(resume.payload).toEqual({ previousStatus: "ON_HOLD", nextStatus: "CONCEPTS_READY", reason: "Trademark cleared", source: "hold_resume" });
  expect((await snapshot(s.admin, p)).status).toBe("CONCEPTS_READY");
});

test("D-03 RESUME restores a seeded hold without heldVersion @admin @api @state", async ({ scenario }) => {
  const s = await scenario("on-hold");
  const res = await expectOk(await post(s.admin, s.projectId(), { status: "RESUME", reason: "Trademark cleared" }));
  expect(res).toEqual({ ok: true, project: { id: s.projectId(), status: "CONCEPTS_READY" } });
  // A second RESUME is no longer valid: the project is not on hold.
  await expectError(await post(s.admin, s.projectId(), { status: "RESUME", reason: "Again" }), 409, "INVALID_HOLD_RESUME");
});

test("D-03 RESUME needs a reason and an ON_HOLD project, otherwise 409 INVALID_HOLD_RESUME @admin @api @state", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  await expectError(await post(s.admin, p, { status: "RESUME" }), 400, "REASON_REQUIRED");
  await expectError(await post(s.admin, p, { status: "RESUME", reason: "Not on hold" }), 409, "INVALID_HOLD_RESUME");
  expect((await auditEvents(s.admin, p, "state_changed"))).toHaveLength(3);
});

test("D-03 CANCELLED is accepted from an active phase and is terminal for hold and resume @admin @api @state", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  expect(await expectOk(await post(s.admin, p, { status: "CANCELLED", reason: "Client withdrew" }))).toEqual({ ok: true, project: { id: p, status: "CANCELLED" } });
  const [event] = await auditEvents(s.admin, p, "state_changed");
  expect(event.payload).toEqual({ previousStatus: "CONCEPTS_READY", nextStatus: "CANCELLED", reason: "Client withdrew", source: "constrained_admin_exception" });
  // CANCELLED → ON_HOLD is not a valid transition; Next reports every refused transition as INVALID_HOLD_RESUME.
  await expectError(await post(s.admin, p, { status: "ON_HOLD", reason: "Pause" }), 409, "INVALID_HOLD_RESUME");
  await expectError(await post(s.admin, p, { status: "RESUME", reason: "Resume" }), 409, "INVALID_HOLD_RESUME");
  expect((await snapshot(s.admin, p)).status).toBe("CANCELLED");
});

test("D-03 CANCELLED from DELIVERED is refused with 409 INVALID_HOLD_RESUME @admin @api @state", async ({ scenario }) => {
  const s = await scenario("delivered");
  await expectError(await post(s.admin, s.projectId(), { status: "CANCELLED", reason: "Too late" }), 409, "INVALID_HOLD_RESUME");
  // DELIVERED → ON_HOLD is allowed.
  expect((await expectOk(await post(s.admin, s.projectId(), { status: "ON_HOLD", reason: "Billing query" }))).project.status).toBe("ON_HOLD");
});

test("D-03 RESUME revalidates the domain evidence of the recorded phase (409 INVALID_HOLD_RESUME) @admin @api @state", async ({ scenario }) => {
  // Scenario stale-hold (story 0.8d): each project's last state_changed is a hold whose recorded phase lacks its evidence.
  const s = await scenario("stale-hold");
  for (const [key, missing] of [["p1", "final ZIP"], ["p2", "visible concept"], ["p3", "pending revision"], ["p4", "brief"]] as const) {
    const p = s.projectId(key);
    const before = await auditEvents(s.admin, p, "state_changed");
    await expectError(await post(s.admin, p, { status: "RESUME", reason: `Resume without ${missing}` }), 409, "INVALID_HOLD_RESUME");
    expect((await snapshot(s.admin, p)).status, key).toBe("ON_HOLD");
    expect(await auditEvents(s.admin, p, "state_changed"), key).toHaveLength(before.length);
  }
});

test("D-03 RESUME is refused when the project changed after the hold (stale heldVersion) @admin @api @state @webhook", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  await expectOk(await post(s.admin, p, { status: "ON_HOLD", reason: "Waiting for trademark check" }));
  const [hold] = await auditEvents(s.admin, p, "state_changed");
  const heldAt = (await snapshot(s.admin, p)).updatedAt;
  expect(hold.payload.heldVersion).toBe(heldAt);
  // An upgrade paid while on hold writes the project (packageCode), which moves its version past heldVersion.
  // The buyer is the seeded client (provisioning requires the client's billing email, lib/checkout-fulfillment.ts:452).
  const customer_details = { address: null, email: CLIENT_A, name: null, phone: null, tax_exempt: "none", tax_ids: [] };
  const upgrade = await loadStripeFixture("upsell-upgrade-professional-complete", { vars: { projectId: p }, sessionOverrides: { customer_details } });
  const delivered = await deliverEvent(buildEvent("checkout.session.completed", upgrade.session));
  expect(delivered.body, delivered.text).toMatchObject({ fulfilled: true, projectId: p });
  const changed = await snapshot(s.admin, p);
  expect({ status: changed.status, packageCode: changed.packageCode, moved: changed.updatedAt !== heldAt }).toEqual({ status: "ON_HOLD", packageCode: "complete", moved: true });
  await expectError(await post(s.admin, p, { status: "RESUME", reason: "Trademark cleared" }), 409, "INVALID_HOLD_RESUME");
  expect((await snapshot(s.admin, p)).status).toBe("ON_HOLD");
});
