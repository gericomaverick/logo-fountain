// POST /api/admin/projects/{id}/reset (brownfield/api-admin.md "Clean-slate reset"; D-15).
import { UNKNOWN_ID, api, auditEvents, conceptsList, expect, expectError, expectOk, snapshot, test } from "./_admin-helpers";

test.describe.configure({ mode: "default" });

const reset = (ctx: any, p: string, data: unknown) => ctx.post(api(p, "/reset"), { data });

test("D-15 reset requires exact confirmation (CONFIRM_REQUIRED) and an existing project @admin @api @state", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  for (const data of [{}, { confirm: true }, { confirm: "true", mode: "clean-slate" }, { confirm: true, mode: "full" }, null]) {
    await expectError(await reset(s.admin, p, data), 400, "CONFIRM_REQUIRED");
  }
  await expectError(await reset(s.admin, UNKNOWN_ID, { confirm: true, mode: "clean-slate" }), 404, "PROJECT_NOT_FOUND");
  expect((await conceptsList(s.admin, p)).concepts).toHaveLength(2);
});

test("D-15 clean-slate reset clears concepts, usage and user messages and returns to BRIEF_SUBMITTED @admin @api @state @audit", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  const body = await expectOk(await reset(s.admin, p, { confirm: true, mode: "clean-slate" }));
  expect(body).toEqual({
    ok: true,
    projectId: p,
    mode: "clean-slate",
    clearMessages: true,
    nextStatus: "BRIEF_SUBMITTED",
    retainedFinalStorageObjects: [],
    retainedConceptStorageObjects: expect.arrayContaining([
      { bucket: "concepts", path: expect.stringContaining(`${p}/${s.conceptId(1)}/`) },
      { bucket: "concepts", path: expect.stringContaining(`${p}/${s.conceptId(2)}/`) },
    ]),
    deleted: { concepts: 2, conceptAssets: 2, finalPublications: 0, revisionRequests: 0, conceptComments: 0, messages: 1 },
    storageCleanup: { attempted: 0, deleted: 0, failures: [] },
  });
  // Effects visible through the API.
  expect((await conceptsList(s.admin, p)).concepts).toEqual([]);
  const snap = await snapshot(s.admin, p);
  expect(snap.status).toBe("BRIEF_SUBMITTED");
  expect(snap.entitlementUsage.concepts).toMatchObject({ limit: 2, consumed: 0, reserved: 0 });
  expect(snap.entitlementUsage.revisions).toMatchObject({ limit: 2, consumed: 0, reserved: 0 });
  expect(snap.messages.every((m: any) => m.kind === "system")).toBe(true);
  expect(snap.messages).toHaveLength(2);
  expect(snap.latestBrief).toBeTruthy();
  const [event] = await auditEvents(s.admin, p, "project_reset");
  expect(event.payload).toMatchObject({
    mode: "clean-slate", clearMessages: true, previousStatus: "CONCEPTS_READY", nextStatus: "BRIEF_SUBMITTED",
    deleted: body.deleted, entitlementsReset: ["concepts", "revisions"], entitlementFieldsReset: ["consumedInt", "reservedInt"],
    retainedFinalReason: "allow_pre_reset_signed_urls_to_expire_without_reactivating_publication_records",
  });
  // Audit history is kept (state changes from the seed are still there).
  expect((await auditEvents(s.admin, p, "state_changed")).length).toBeGreaterThanOrEqual(3);
});

test("D-15 reset with clearMessages:false keeps user messages @admin @api @state", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const body = await expectOk(await reset(s.admin, s.projectId(), { confirm: true, mode: "clean-slate", clearMessages: false }));
  expect(body.clearMessages).toBe(false);
  expect(body.deleted.messages).toBe(0);
  expect((await snapshot(s.admin, s.projectId())).messages).toHaveLength(3);
});

test("D-15 reset of a delivered-phase project drops final publications but retains the stored objects @admin @api @state @finals", async ({ scenario }) => {
  const s = await scenario("final-files-ready");
  const p = s.projectId();
  const body = await expectOk(await reset(s.admin, p, { confirm: true, mode: "clean-slate" }));
  expect(body.deleted).toMatchObject({ concepts: 2, finalPublications: 1 });
  expect(body.retainedFinalStorageObjects).toEqual([{ bucket: "final-deliverables", path: expect.stringContaining(`${p}/finals/`) }]);
  expect((await snapshot(s.admin, p)).status).toBe("BRIEF_SUBMITTED");
  await expectError(await s.admin.post(api(p, "/finals/download")), 404, "FINAL_ZIP_NOT_AVAILABLE");
});

test("D-15 reset without a brief returns to AWAITING_BRIEF @admin @api @state", async ({ scenario }) => {
  const s = await scenario("awaiting-brief");
  const body = await expectOk(await reset(s.admin, s.projectId(), { confirm: true, mode: "clean-slate" }));
  expect(body.nextStatus).toBe("AWAITING_BRIEF");
  expect(body.deleted).toEqual({ concepts: 0, conceptAssets: 0, finalPublications: 0, revisionRequests: 0, conceptComments: 0, messages: 0 });
});
