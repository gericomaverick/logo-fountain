// Concept publish / delete and "mark revision delivered" (brownfield/api-admin.md "Concepts"; D-06, D-07, D-09).
import { UNKNOWN_ID, api, auditEvents, conceptsList, expect, expectError, expectOk, snapshot, test } from "./_admin-helpers";

test.describe.configure({ mode: "default" });

const publish = (ctx: any, p: string, c: string) => ctx.post(api(p, `/concepts/${c}/publish`));
const remove = (ctx: any, p: string, c: string) => ctx.delete(api(p, `/concepts/${c}`));
const deliver = (ctx: any, p: string, r: string, data: unknown = {}) => ctx.post(api(p, `/revision-requests/${r}/delivered`), { data });

test("D-06 publishing an already published concept is idempotent and consumes nothing @admin @api @concepts", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  const body = await expectOk(await publish(s.admin, p, s.conceptId(1)));
  // Current Next shape: no publishedNow flag in the response; projectStatus is null when nothing changed.
  expect(body).toEqual({ ok: true, concept: { id: s.conceptId(1), number: 1, status: "published" }, projectStatus: null });
  expect(await auditEvents(s.admin, p, "concept_published")).toEqual([]);
  expect((await snapshot(s.admin, p)).entitlementUsage.concepts.consumed).toBe(2);
});

test("D-06 publish refuses non-draft concepts with 409 CONCEPT_NOT_PUBLISHABLE and unknown ones with 404 @admin @api @concepts", async ({ scenario }) => {
  const s = await scenario("awaiting-approval");
  const p = s.projectId();
  await expectError(await publish(s.admin, p, s.conceptId(1)), 409, "CONCEPT_NOT_PUBLISHABLE"); // approved
  await expectError(await publish(s.admin, p, s.conceptId(2)), 409, "CONCEPT_NOT_PUBLISHABLE"); // archived
  await expectError(await publish(s.admin, p, UNKNOWN_ID), 404, "CONCEPT_NOT_FOUND");
  await expectError(await publish(s.admin, UNKNOWN_ID, s.conceptId(1)), 404, "CONCEPT_NOT_FOUND");
  expect((await conceptsList(s.admin, p)).concepts.map((c: any) => c.status)).toEqual(["approved", "archived"]);
});

test.fixme("D-06 publishing a draft consumes a slot, writes concept_published and a system message @admin @api @concepts", async () => {
  // No seed scenario contains a draft concept (F-10: no UI path creates drafts). Needs a scenario with
  // concepts:[{status:"draft"}] in BRIEF_SUBMITTED and in CONCEPTS_READY (shared change to fixtures/scenarios).
});

test("D-07 deleting a concept soft-deletes it, audits concept_deleted and is idempotent @admin @api @concepts @audit", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  expect(await expectOk(await remove(s.admin, p, s.conceptId(2)))).toEqual({ ok: true });
  expect((await conceptsList(s.admin, p)).concepts.map((c: any) => [c.number, c.status])).toEqual([[1, "published"], [2, "deleted"]]);
  const [event] = await auditEvents(s.admin, p, "concept_deleted");
  expect(event.payload).toEqual({ conceptId: s.conceptId(2), conceptNumber: 2, previousStatus: "published", deletedRevisionRequests: 0, deletedRevisionRequestIds: [] });
  // Consumed usage is never rewound.
  expect((await snapshot(s.admin, p)).entitlementUsage.concepts.consumed).toBe(2);
  // Second delete: ok, no second audit.
  expect(await expectOk(await remove(s.admin, p, s.conceptId(2)))).toEqual({ ok: true });
  expect(await auditEvents(s.admin, p, "concept_deleted")).toHaveLength(1);
});

test("D-07 delete refuses the last visible concept and the wrong phase with 409 CONCEPT_DELETE_PHASE_GUARD @admin @api @concepts", async ({ scenario }) => {
  let s = await scenario("concepts-ready");
  await expectOk(await remove(s.admin, s.projectId(), s.conceptId(2)));
  await expectError(await remove(s.admin, s.projectId(), s.conceptId(1)), 409, "CONCEPT_DELETE_PHASE_GUARD");
  await expectError(await remove(s.admin, s.projectId(), UNKNOWN_ID), 404, "CONCEPT_NOT_FOUND");
  s = await scenario("awaiting-approval");
  await expectError(await remove(s.admin, s.projectId(), s.conceptId(1)), 409, "CONCEPT_DELETE_PHASE_GUARD"); // approved
  await expectError(await remove(s.admin, s.projectId(), s.conceptId(2)), 409, "CONCEPT_DELETE_PHASE_GUARD"); // phase
  s = await scenario("revision-reserved");
  await expectError(await remove(s.admin, s.projectId(), s.conceptId(2)), 409, "CONCEPT_DELETE_PHASE_GUARD"); // REVISIONS_IN_PROGRESS
});

test("D-09 marking a revision delivered consumes the reservation, returns to CONCEPTS_READY and is idempotent @admin @api @revisions @audit", async ({ scenario }) => {
  const s = await scenario("revision-reserved");
  const p = s.projectId();
  const rid = s.revisionId();
  const body = await expectOk(await deliver(s.admin, p, rid));
  expect(body).toEqual({ ok: true, revisionRequest: { id: rid, status: "delivered", updatedAt: expect.any(String) }, project: { id: p, status: "CONCEPTS_READY" } });
  const snap = await snapshot(s.admin, p);
  expect(snap.status).toBe("CONCEPTS_READY");
  expect(snap.entitlementUsage.revisions).toMatchObject({ limit: 2, consumed: 1, reserved: 0 });
  expect(snap.messages.map((m: any) => m.body)).toContain(`Revision update delivered (${rid.slice(0, 8)}).`);
  const [event] = await auditEvents(s.admin, p, "revision_delivered");
  expect(event.payload).toEqual({ revisionRequestId: rid, consumedEntitlement: true });
  const [state] = await auditEvents(s.admin, p, "state_changed");
  expect(state.payload).toEqual({ previousStatus: "REVISIONS_IN_PROGRESS", nextStatus: "CONCEPTS_READY" });

  const again = await expectOk(await deliver(s.admin, p, rid));
  expect(again).toEqual({ ok: true, revisionRequest: { id: rid, status: "delivered", updatedAt: expect.any(String) }, project: null });
  expect(await auditEvents(s.admin, p, "revision_delivered")).toHaveLength(1);
  expect((await snapshot(s.admin, p)).entitlementUsage.revisions.consumed).toBe(1);
});

test("D-09 setConceptsReady:false delivers without changing the project status @admin @api @revisions", async ({ scenario }) => {
  const s = await scenario("revision-reserved");
  const body = await expectOk(await deliver(s.admin, s.projectId(), s.revisionId(), { setConceptsReady: false }));
  expect(body.project).toBeNull();
  expect(body.revisionRequest.status).toBe("delivered");
  expect((await snapshot(s.admin, s.projectId())).status).toBe("REVISIONS_IN_PROGRESS");
});

test("D-09 delivered errors: 404 REVISION_REQUEST_NOT_FOUND, 409 INVALID_PROJECT_STATUS_TRANSITION @admin @api @revisions", async ({ scenario }) => {
  const s = await scenario("revision-reserved");
  const p = s.projectId();
  await expectError(await deliver(s.admin, p, UNKNOWN_ID), 404, "REVISION_REQUEST_NOT_FOUND");
  await expectError(await deliver(s.admin, UNKNOWN_ID, s.revisionId()), 404, "REVISION_REQUEST_NOT_FOUND");
  await expectOk(await s.admin.post(api(p, "/status"), { data: { status: "ON_HOLD", reason: "Paused" } }));
  await expectError(await deliver(s.admin, p, s.revisionId()), 409, "INVALID_PROJECT_STATUS_TRANSITION");
  const { revisionRequests } = await expectOk(await s.admin.get(api(p, "/revision-requests")));
  expect(revisionRequests[0].status).toBe("requested");
});
