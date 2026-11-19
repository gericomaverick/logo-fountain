// GET/POST /api/admin/projects/{id}/concepts (brownfield/api-admin.md "Concepts"; storage-and-uploads.md §5).
// Upload-success cases need the S3 endpoint (SeaweedFS) configured for the target.
import {
  UNKNOWN_ID, api, auditEvents, conceptsList, expect, expectError, expectOk, pngFile, randomUUID, snapshot, test, uploadConcept,
} from "./_admin-helpers";

test.describe.configure({ mode: "default" });

test("D-05 concepts list returns every concept with a signed image, version and pending feedback @admin @api @concepts", async ({ scenario }) => {
  const s = await scenario("revision-reserved");
  const body = await conceptsList(s.admin, s.projectId());
  expect(Object.keys(body).sort()).toEqual(["conceptlessPendingRevisionCount", "concepts", "pendingRevisionRequests", "projectStatus"]);
  expect(body.projectStatus).toBe("REVISIONS_IN_PROGRESS");
  expect(body.conceptlessPendingRevisionCount).toBe(0);
  expect(body.concepts.map((c: any) => [c.number, c.status, c.revisionVersion, c.pendingRevisionCount, c.unresolvedFeedbackCount])).toEqual([
    [1, "published", 1, 1, 1],
    [2, "published", 1, 0, 0],
  ]);
  expect(body.concepts[0]).toMatchObject({ id: s.conceptId(1), notes: "Concept 1 notes", imageUrl: expect.stringMatching(/^https?:\/\//) });
  expect(body.pendingRevisionRequests).toEqual([
    {
      id: s.revisionId(),
      conceptId: s.conceptId(1),
      body: "Could the icon be a little bolder?",
      createdAt: expect.any(String),
      concept: { id: s.conceptId(1), number: 1 },
      user: { email: "client.a@parity.test", fullName: "Ada Client" },
    },
  ]);
});

test("D-05 concepts list includes non-visible statuses and is empty for an unknown project @admin @api @concepts", async ({ scenario }) => {
  const s = await scenario("awaiting-approval");
  const body = await conceptsList(s.admin, s.projectId());
  expect(body.concepts.map((c: any) => [c.number, c.status])).toEqual([[1, "approved"], [2, "archived"]]);
  const unknown = await conceptsList(s.admin, UNKNOWN_ID);
  expect(unknown).toEqual({ concepts: [], projectStatus: null, conceptlessPendingRevisionCount: 0, pendingRevisionRequests: [] });
});

test("D-05/X-12 concept upload validation: FILE_REQUIRED, REQUEST_KEY_REQUIRED, INVALID_FILE_TYPE, FILE_SIGNATURE_MISMATCH @admin @api @concepts @uploads", async ({ scenario }) => {
  const s = await scenario("brief-submitted");
  const p = s.projectId();
  await expectError(await uploadConcept(s.admin, p, { file: null }), 400, "FILE_REQUIRED");
  await expectError(await uploadConcept(s.admin, p, { file: { name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) } }), 400, "FILE_REQUIRED");
  // The file check precedes the key check.
  await expectError(await uploadConcept(s.admin, p, { file: null, requestKey: null }), 400, "FILE_REQUIRED");
  await expectError(await uploadConcept(s.admin, p, { requestKey: null }), 400, "REQUEST_KEY_REQUIRED");
  await expectError(await uploadConcept(s.admin, p, { requestKey: "not-a-uuid" }), 400, "REQUEST_KEY_REQUIRED");
  await expectError(await uploadConcept(s.admin, p, { requestKey: "6f1c2a8e-0b3d-1c4e-8f00-123456789abc" }), 400, "REQUEST_KEY_REQUIRED"); // v1, not v4
  await expectError(await uploadConcept(s.admin, p, { file: { ...pngFile(), name: "concept.gif" } }), 400, "INVALID_FILE_TYPE");
  await expectError(await uploadConcept(s.admin, p, { file: { ...pngFile(), mimeType: "image/jpeg" } }), 400, "INVALID_FILE_TYPE");
  await expectError(await uploadConcept(s.admin, p, { file: { ...pngFile(), name: "concept.jpg", mimeType: "image/jpeg" } }), 400, "FILE_SIGNATURE_MISMATCH");
  // Nothing was created.
  expect((await conceptsList(s.admin, p)).concepts).toEqual([]);
  expect(await auditEvents(s.admin, p, "concept_upload_request")).toEqual([]);
});

test("D-05 concept upload refuses an unknown project, a wrong phase and an exhausted entitlement @admin @api @concepts", async ({ scenario }) => {
  let s = await scenario("concepts-ready");
  await expectError(await uploadConcept(s.admin, UNKNOWN_ID, {}), 404, "PROJECT_NOT_FOUND");
  // concepts-ready has used both concept slots (2/2).
  const exhausted = await expectError(await uploadConcept(s.admin, s.projectId(), {}), 400, "CONCEPT_ENTITLEMENT_EXHAUSTED");
  expect(exhausted.error.details).toEqual({ nextStep: expect.any(String) });
  s = await scenario("awaiting-brief");
  await expectError(await uploadConcept(s.admin, s.projectId(), {}), 409, "INVALID_PROJECT_STATUS_TRANSITION");
  s = await scenario("awaiting-approval");
  await expectError(await uploadConcept(s.admin, s.projectId(), { uploadMode: "replace", conceptNumber: 1 }), 409, "INVALID_PROJECT_STATUS_TRANSITION");
  await expectError(await uploadConcept(s.admin, s.projectId(), { uploadMode: "revision", conceptId: s.conceptId(1) }), 409, "INVALID_PROJECT_STATUS_TRANSITION");
});

test("D-05/X-13 new concept upload publishes immediately, moves to CONCEPTS_READY and records a receipt @admin @api @concepts @uploads @audit", async ({ scenario }) => {
  const s = await scenario("brief-submitted");
  const p = s.projectId();
  const requestKey = randomUUID();
  const body = await expectOk(await uploadConcept(s.admin, p, { requestKey, notes: "  First direction  ", assetNotes: "v1 artwork" }));
  expect(body).toEqual({
    ok: true,
    concept: { id: expect.any(String), number: 1, status: "published", notes: "First direction" },
    projectStatus: "CONCEPTS_READY",
  });
  const list = await conceptsList(s.admin, p);
  expect(list.projectStatus).toBe("CONCEPTS_READY");
  expect(list.concepts).toEqual([
    expect.objectContaining({ id: body.concept.id, number: 1, status: "published", revisionVersion: 1, imageUrl: expect.stringMatching(/^https?:\/\//) }),
  ]);
  const snap = await snapshot(s.admin, p);
  expect(snap.entitlementUsage.concepts).toMatchObject({ limit: 2, consumed: 1, reserved: 0 });
  expect(snap.messages.map((m: any) => m.body)).toContain("Concept 1 is ready for review.");

  const types = (await auditEvents(s.admin, p)).map((e) => e.type);
  for (const type of ["entitlement_consumed", "state_changed", "concept_uploaded", "concept_upload_request"]) expect(types).toContain(type);
  const [uploaded] = await auditEvents(s.admin, p, "concept_uploaded");
  expect(uploaded.payload).toEqual({
    conceptId: body.concept.id, conceptNumber: 1, filePath: expect.stringMatching(new RegExp(`^${p}/${body.concept.id}/v1\\.[0-9a-f-]{36}\\.png$`)),
    published: true, uploadMode: "concept", deliveredRevisionRequests: 0,
  });
  const [consumed] = await auditEvents(s.admin, p, "entitlement_consumed");
  expect(consumed.payload).toMatchObject({ key: "concepts", reason: "admin_concept_publish", conceptId: body.concept.id, conceptNumber: 1 });
  const [receipt] = await auditEvents(s.admin, p, "concept_upload_request");
  expect(receipt.payload).toMatchObject({ requestKey, digest: expect.stringMatching(/^[0-9a-f]{64}$/), result: { concept: body.concept, projectStatus: "CONCEPTS_READY" }, object: { bucket: "concepts", path: uploaded.payload.filePath } });
});

test("D-05/X-13 replaying a requestKey returns the stored result; different content gives 409 REQUEST_KEY_MISMATCH @admin @api @concepts @uploads", async ({ scenario }) => {
  const s = await scenario("brief-submitted");
  const p = s.projectId();
  const requestKey = randomUUID();
  const fields = { requestKey, file: pngFile(1), notes: "Direction A" };
  const first = await expectOk(await uploadConcept(s.admin, p, fields));
  const replay = await expectOk(await uploadConcept(s.admin, p, { ...fields, file: pngFile(1) }));
  expect(replay).toEqual({ ok: true, concept: first.concept, projectStatus: first.projectStatus, replayed: true });
  expect((await conceptsList(s.admin, p)).concepts).toHaveLength(1);
  expect(await auditEvents(s.admin, p, "concept_upload_request")).toHaveLength(1);
  expect((await snapshot(s.admin, p)).entitlementUsage.concepts.consumed).toBe(1);

  await expectError(await uploadConcept(s.admin, p, { ...fields, file: pngFile(2) }), 409, "REQUEST_KEY_MISMATCH");
  await expectError(await uploadConcept(s.admin, p, { ...fields, notes: "Direction B" }), 409, "REQUEST_KEY_MISMATCH");
  // A fresh key creates the next concept.
  const second = await expectOk(await uploadConcept(s.admin, p, { file: pngFile(3) }));
  expect(second.concept.number).toBe(2);
  expect(second.projectStatus).toBe("CONCEPTS_READY");
});

test("D-05 replace upload keeps the concept, updates notes and adds a version without consuming a slot @admin @api @concepts @uploads", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  const body = await expectOk(await uploadConcept(s.admin, p, { uploadMode: "replace", conceptNumber: 1, notes: "Bolder mark" }));
  expect(body).toEqual({ ok: true, concept: { id: s.conceptId(1), number: 1, status: "published", notes: "Bolder mark" }, projectStatus: "CONCEPTS_READY" });
  const list = await conceptsList(s.admin, p);
  expect(list.concepts.map((c: any) => [c.number, c.revisionVersion, c.notes])).toEqual([[1, 2, "Bolder mark"], [2, 1, "Concept 2 notes"]]);
  expect((await snapshot(s.admin, p)).entitlementUsage.concepts).toMatchObject({ limit: 2, consumed: 2 });
  const [uploaded] = await auditEvents(s.admin, p, "concept_uploaded");
  expect(uploaded.payload).toMatchObject({ conceptId: s.conceptId(1), uploadMode: "replace", filePath: expect.stringContaining(`${p}/${s.conceptId(1)}/v2.`) });
  expect(await auditEvents(s.admin, p, "entitlement_consumed")).toEqual([]);
});

test("D-05 replace upload errors: INVALID_CONCEPT_NUMBER, CONCEPT_NOT_FOUND, CONCEPT_NOT_REPLACEABLE @admin @api @concepts", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  await expectError(await uploadConcept(s.admin, p, { uploadMode: "replace" }), 400, "INVALID_CONCEPT_NUMBER");
  await expectError(await uploadConcept(s.admin, p, { uploadMode: "replace", conceptNumber: 0 }), 400, "INVALID_CONCEPT_NUMBER");
  await expectError(await uploadConcept(s.admin, p, { uploadMode: "replace", conceptNumber: 9 }), 404, "CONCEPT_NOT_FOUND");
  await expectOk(await s.admin.delete(api(p, `/concepts/${s.conceptId(2)}`)));
  await expectError(await uploadConcept(s.admin, p, { uploadMode: "replace", conceptNumber: 2 }), 409, "CONCEPT_NOT_REPLACEABLE");
});

test("D-08/D-05 revision upload delivers every pending request, consumes the reservation and returns to CONCEPTS_READY @admin @api @revisions @uploads", async ({ scenario }) => {
  const s = await scenario("revision-reserved");
  const p = s.projectId();
  const body = await expectOk(await uploadConcept(s.admin, p, { uploadMode: "revision", conceptId: s.conceptId(1), notes: "Bolder icon" }));
  // The revision keeps the concept as it was (notes are not changed by a revision upload).
  expect(body).toEqual({ ok: true, concept: { id: s.conceptId(1), number: 1, status: "published", notes: "Concept 1 notes" }, projectStatus: "CONCEPTS_READY" });
  const { revisionRequests } = await expectOk(await s.admin.get(api(p, "/revision-requests")));
  expect(revisionRequests.map((r: any) => r.status)).toEqual(["delivered"]);
  const snap = await snapshot(s.admin, p);
  expect(snap.status).toBe("CONCEPTS_READY");
  expect(snap.entitlementUsage.revisions).toMatchObject({ limit: 2, consumed: 1, reserved: 0 });
  expect(snap.messages.map((m: any) => m.body)).toContain("Revision delivered for Concept 1.");
  const [event] = await auditEvents(s.admin, p, "concept_revision_uploaded");
  expect(event.payload).toMatchObject({ conceptId: s.conceptId(1), conceptNumber: 1, published: true, uploadMode: "revision", deliveredRevisionRequests: 1 });
  expect((await conceptsList(s.admin, p)).concepts[0]).toMatchObject({ revisionVersion: 2, pendingRevisionCount: 0 });
});

test("D-08 revision upload errors: CONCEPT_ID_REQUIRED, CONCEPT_NOT_FOUND, NO_PENDING_REVISION_REQUESTS @admin @api @revisions", async ({ scenario }) => {
  const s = await scenario("revision-reserved");
  const p = s.projectId();
  await expectError(await uploadConcept(s.admin, p, { uploadMode: "revision" }), 400, "CONCEPT_ID_REQUIRED");
  await expectError(await uploadConcept(s.admin, p, { uploadMode: "revision", conceptId: UNKNOWN_ID }), 404, "CONCEPT_NOT_FOUND");
  await expectError(await uploadConcept(s.admin, p, { uploadMode: "revision", conceptId: s.conceptId(2) }), 400, "NO_PENDING_REVISION_REQUESTS");
  // The refused uploads left the reservation untouched.
  expect((await snapshot(s.admin, p)).entitlementUsage.revisions).toMatchObject({ consumed: 0, reserved: 1 });
});
