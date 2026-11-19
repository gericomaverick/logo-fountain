// PATCH /entitlements and the disabled POST /entitlements/reset (brownfield/api-admin.md "Entitlements"; D-14).
import { UNKNOWN_ID, api, auditEvents, expect, expectError, expectOk, snapshot, test } from "./_admin-helpers";

test.describe.configure({ mode: "default" });

const patch = (ctx: any, p: string, data: unknown) => ctx.patch(api(p, "/entitlements"), { data });

test("D-14 entitlement override validation codes @admin @api @entitlements", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  await expectError(await s.admin.patch(api(p, "/entitlements"), { headers: { "content-type": "application/json" }, data: "{not json" }), 400, "INVALID_JSON");
  await expectError(await patch(s.admin, p, null), 400, "INVALID_JSON");
  for (const concepts of [-1, 1001, 1.5, "3", true]) {
    await expectError(await patch(s.admin, p, { concepts, reason: "Goodwill" }), 400, "INVALID_CONCEPTS_LIMIT");
  }
  for (const revisions of [-1, 1001, 2.5, "2"]) {
    await expectError(await patch(s.admin, p, { revisions, reason: "Goodwill" }), 400, "INVALID_REVISIONS_LIMIT");
  }
  // Limits are validated before their presence and the reason.
  await expectError(await patch(s.admin, p, { concepts: 5000 }), 400, "INVALID_CONCEPTS_LIMIT");
  await expectError(await patch(s.admin, p, { reason: "Goodwill" }), 400, "MISSING_LIMITS");
  await expectError(await patch(s.admin, p, { concepts: 3 }), 400, "OVERRIDE_REASON_REQUIRED");
  await expectError(await patch(s.admin, p, { concepts: 3, reason: "   " }), 400, "OVERRIDE_REASON_REQUIRED");
  await expectError(await patch(s.admin, p, { concepts: 3, reason: "x".repeat(501) }), 400, "OVERRIDE_REASON_TOO_LONG");
  await expectError(await patch(s.admin, UNKNOWN_ID, { concepts: 3, reason: "Goodwill" }), 404, "PROJECT_NOT_FOUND");
  expect(await auditEvents(s.admin, p, "entitlement_limit_overridden")).toEqual([]);
});

test("D-14 entitlement override changes only the limits and audits before/after @admin @api @entitlements @audit", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  const body = await expectOk(await patch(s.admin, p, { concepts: 3, reason: "  Goodwill extra concept  " }));
  expect(body.ok).toBe(true);
  expect(body.changed).toBe(true);
  const byKey = Object.fromEntries(body.entitlements.map((e: any) => [e.key, e]));
  expect(byKey).toEqual({
    concepts: { key: "concepts", limitInt: 3, consumedInt: 2, reservedInt: 0 },
    revisions: { key: "revisions", limitInt: 2, consumedInt: 0, reservedInt: 0 },
  });
  expect(body.entitlementUsage.concepts).toMatchObject({ limit: 3, consumed: 2, reserved: 0, remaining: 1, unlimited: false });
  const [event] = await auditEvents(s.admin, p, "entitlement_limit_overridden");
  expect(event.payload).toMatchObject({ changed: { concepts: true, revisions: false }, reason: "Goodwill extra concept" });
  expect(event.payload.before).toEqual(expect.arrayContaining([{ key: "concepts", limitInt: 2, consumedInt: 2, reservedInt: 0 }]));
  expect(event.payload.after).toEqual(expect.arrayContaining([{ key: "concepts", limitInt: 3, consumedInt: 2, reservedInt: 0 }]));
  expect(event.actor.email).toBe("admin@parity.test");

  // The same limit again: no change, no audit.
  const same = await expectOk(await patch(s.admin, p, { concepts: 3, reason: "Again" }));
  expect(same.changed).toBe(false);
  expect(await auditEvents(s.admin, p, "entitlement_limit_overridden")).toHaveLength(1);
});

test("D-14 entitlement override accepts null (unlimited) and limits below current usage @admin @api @entitlements", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  const body = await expectOk(await patch(s.admin, p, { concepts: null, revisions: 0, reason: "Reconfigure" }));
  // Stored limit is null; the usage view reports unlimited with limit 0 (computeEntitlementUsage).
  expect(body.entitlements.find((e: any) => e.key === "concepts").limitInt).toBeNull();
  expect(body.entitlementUsage.concepts).toMatchObject({ limit: 0, unlimited: true, consumed: 2 });
  expect(body.entitlementUsage.revisions).toMatchObject({ limit: 0, consumed: 0 });
  const below = await expectOk(await patch(s.admin, p, { concepts: 0, reason: "Below usage" }));
  expect(below.entitlementUsage.concepts).toMatchObject({ limit: 0, consumed: 2 });
  const [event] = await auditEvents(s.admin, p, "entitlement_limit_overridden");
  expect(event.payload.changed).toEqual({ concepts: true, revisions: false });
  expect((await snapshot(s.admin, p)).entitlementUsage.concepts.limit).toBe(0);
});

test("D-14 standalone entitlement usage reset is disabled: 409 ENTITLEMENT_USAGE_RESET_DISABLED @admin @api @entitlements", async ({ scenario }) => {
  const s = await scenario("revision-reserved");
  await expectError(await s.admin.post(api(s.projectId(), "/entitlements/reset")), 409, "ENTITLEMENT_USAGE_RESET_DISABLED");
  await expectError(await s.admin.post(api(UNKNOWN_ID, "/entitlements/reset"), { data: { key: "revisions" } }), 409, "ENTITLEMENT_USAGE_RESET_DISABLED");
  expect((await snapshot(s.admin, s.projectId())).entitlementUsage.revisions).toMatchObject({ consumed: 0, reserved: 1 });
});
