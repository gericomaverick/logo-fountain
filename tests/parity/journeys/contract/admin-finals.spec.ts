// Finals upload / notify / download (brownfield/api-admin.md "Finals"; D-11, D-12, D-13; F-11 string-shaped errors).
// Email outcomes depend on the target's mail configuration, so notification bodies are asserted on the
// fields every outcome shares (committed, finalLive, the guarded asset).
import { UNKNOWN_ID, api, auditEvents, expect, expectError, expectOk, snapshot, test, uploadFinals, zipFile } from "./_admin-helpers";

test.describe.configure({ mode: "default" });

test("D-11 finals upload errors keep the current string-shaped body (F-11) @admin @api @finals @uploads", async ({ scenario }) => {
  const s = await scenario("awaiting-approval");
  const p = s.projectId();
  let res = await uploadFinals(s.admin, p, null);
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: "ZIP file is required", code: "FILE_REQUIRED" });
  res = await uploadFinals(s.admin, p, { name: "finals.zip", mimeType: "application/zip", buffer: Buffer.alloc(0) });
  expect(await res.json()).toEqual({ error: "ZIP file is required", code: "FILE_REQUIRED" });
  for (const [file, code] of [
    [{ ...zipFile(), name: "finals.txt", mimeType: "text/plain" }, "INVALID_FILE_TYPE"],
    [{ ...zipFile(), mimeType: "application/octet-stream" }, "INVALID_FILE_TYPE"],
    [{ ...zipFile(), buffer: Buffer.from("not a zip at all") }, "FILE_SIGNATURE_MISMATCH"],
  ] as const) {
    res = await uploadFinals(s.admin, p, file);
    const body = await res.json();
    expect({ status: res.status(), code: body.code, errorType: typeof body.error }).toEqual({ status: 400, code, errorType: "string" });
  }
  // The project 404 uses the standard shape.
  await expectError(await uploadFinals(s.admin, UNKNOWN_ID), 404, "PROJECT_NOT_FOUND");
  expect((await snapshot(s.admin, p)).status).toBe("AWAITING_APPROVAL");
});

test("D-11 finals upload refuses a phase that can't reach the target status @admin @api @finals", async ({ scenario }) => {
  const s = await scenario("awaiting-brief");
  const body = await expectError(await uploadFinals(s.admin, s.projectId()), 400, "INVALID_PROJECT_STATUS_TRANSITION");
  expect(body.error.details).toMatchObject({ allowed: expect.any(Array) });
});

test("D-11 finals upload after approval publishes FINAL_FILES_READY with audit and system message @admin @api @finals @uploads @audit", async ({ scenario }) => {
  const s = await scenario("awaiting-approval");
  const p = s.projectId();
  const body = await expectOk(await uploadFinals(s.admin, p));
  expect(body).toMatchObject({
    ok: true,
    fileAsset: { id: expect.any(String), kind: "final_zip", path: expect.stringMatching(new RegExp(`^${p}/finals/[0-9a-f-]{36}\\.zip$`)) },
    project: { id: p, status: "FINAL_FILES_READY" },
    retainedPreviousAsset: null,
    recoveredAfterTransactionError: false,
    currentPublication: true,
  });
  expect(body).toHaveProperty("email");
  const snap = await snapshot(s.admin, p);
  expect(snap.status).toBe("FINAL_FILES_READY");
  expect(snap.finalZip).toMatchObject({ available: true, assetId: body.fileAsset.id });
  expect(snap.messages.map((m: any) => m.body)).toContain("Final files are ready to download.");
  const [event] = await auditEvents(s.admin, p, "finals_uploaded");
  expect(event.payload).toEqual({ fileAssetId: body.fileAsset.id, path: body.fileAsset.path, supersededFileAssetId: null });
  const [state] = await auditEvents(s.admin, p, "state_changed");
  expect(state.payload).toEqual({ previousStatus: "AWAITING_APPROVAL", nextStatus: "FINAL_FILES_READY" });
});

test("D-11 finals upload before approval moves CONCEPTS_READY to AWAITING_APPROVAL @admin @api @finals @uploads", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const body = await expectOk(await uploadFinals(s.admin, s.projectId()));
  expect(body).toMatchObject({ ok: true, project: { status: "AWAITING_APPROVAL" }, email: null, currentPublication: true });
  expect((await snapshot(s.admin, s.projectId())).status).toBe("AWAITING_APPROVAL");
});

test("D-11 finals repair in FINAL_FILES_READY keeps the status and the superseded asset @admin @api @finals @uploads", async ({ scenario }) => {
  const s = await scenario("final-files-ready");
  const p = s.projectId();
  const body = await expectOk(await uploadFinals(s.admin, p));
  expect(body).toMatchObject({ ok: true, project: { id: p, status: "FINAL_FILES_READY" }, retainedPreviousAsset: { id: s.finalAssetId(), path: expect.stringContaining(`${p}/finals/`) } });
  const [event] = await auditEvents(s.admin, p, "finals_uploaded");
  expect(event.payload.supersededFileAssetId).toBe(s.finalAssetId());
  expect(await auditEvents(s.admin, p, "state_changed")).toHaveLength(5); // no new state change
  expect((await snapshot(s.admin, p)).finalZip.assetId).toBe(body.fileAsset.id);
});

test("D-12 finals notify requires the asset and project version (FINAL_NOTIFICATION_VERSION_REQUIRED) @admin @api @finals @email", async ({ scenario }) => {
  const s = await scenario("final-files-ready");
  const p = s.projectId();
  const { updatedAt } = await snapshot(s.admin, p);
  for (const data of [{}, { assetId: s.finalAssetId() }, { projectUpdatedAt: updatedAt }, { assetId: s.finalAssetId(), projectUpdatedAt: "not a date" }, { assetId: "  ", projectUpdatedAt: updatedAt }]) {
    await expectError(await s.admin.post(api(p, "/finals/notify"), { data }), 400, "FINAL_NOTIFICATION_VERSION_REQUIRED");
  }
});

test("D-12 finals notify with a stale version or asset is 409 FINAL_NOTIFICATION_CONFLICT @admin @api @finals @email", async ({ scenario }) => {
  const s = await scenario("final-files-ready");
  const p = s.projectId();
  const { updatedAt } = await snapshot(s.admin, p);
  const stale = new Date(Date.parse(updatedAt) - 1000).toISOString();
  await expectError(await s.admin.post(api(p, "/finals/notify"), { data: { assetId: s.finalAssetId(), projectUpdatedAt: stale } }), 409, "FINAL_NOTIFICATION_CONFLICT");
  await expectError(await s.admin.post(api(p, "/finals/notify"), { data: { assetId: UNKNOWN_ID, projectUpdatedAt: updatedAt } }), 409, "FINAL_NOTIFICATION_CONFLICT");
  // A superseded asset is no longer notifiable.
  const upload = await expectOk(await uploadFinals(s.admin, p));
  const fresh = (await snapshot(s.admin, p)).updatedAt;
  await expectError(await s.admin.post(api(p, "/finals/notify"), { data: { assetId: s.finalAssetId(), projectUpdatedAt: fresh } }), 409, "FINAL_NOTIFICATION_CONFLICT");
  expect(upload.fileAsset.id).not.toBe(s.finalAssetId());
  // Not in a final phase.
  const other = await scenario("concepts-ready");
  const v = (await snapshot(other.admin, other.projectId())).updatedAt;
  await expectError(await other.admin.post(api(other.projectId(), "/finals/notify"), { data: { assetId: UNKNOWN_ID, projectUpdatedAt: v } }), 409, "FINAL_NOTIFICATION_CONFLICT");
});

test("D-12 finals notify for the current asset passes the guard and reports the email outcome @admin @api @finals @email", async ({ scenario }) => {
  const s = await scenario("final-files-ready");
  const p = s.projectId();
  const { updatedAt } = await snapshot(s.admin, p);
  const res = await s.admin.post(api(p, "/finals/notify"), { data: { assetId: s.finalAssetId(), projectUpdatedAt: updatedAt } });
  const body = await res.json();
  // 200 {ok, notification} when mail is configured; 503 FINAL_NOTIFICATION_SKIPPED without Postmark (local Next).
  expect([200, 503]).toContain(res.status());
  expect(body).toMatchObject({ committed: true, finalLive: true, fileAsset: { id: s.finalAssetId(), path: expect.any(String) } });
  if (res.status() === 503) expect(body).toMatchObject({ ok: false, code: "FINAL_NOTIFICATION_SKIPPED" });
  else expect(body).toMatchObject({ ok: true, notification: expect.any(String) });
  // The guard is a same-version write: the project version is unchanged.
  expect((await snapshot(s.admin, p)).updatedAt).toBe(updatedAt);
});

test("D-13 admin final download signs the newest ZIP without changing status @admin @api @finals", async ({ scenario, request }) => {
  const s = await scenario("final-files-ready");
  const p = s.projectId();
  const before = await snapshot(s.admin, p);
  const body = await expectOk(await s.admin.post(api(p, "/finals/download")));
  expect(Object.keys(body)).toEqual(["url"]);
  const url = new URL(body.url);
  // {client.name slug}-{asset createdAt UTC date}.zip
  expect(url.searchParams.get("response-content-disposition")).toMatch(/^attachment; filename="ada-client-(\d{4}-\d\d-\d\d)\.zip"; filename\*=UTF-8''ada-client-\1\.zip$/);
  expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
  const zip = await request.get(body.url);
  expect(zip.status()).toBe(200);
  expect((await zip.body()).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const after = await snapshot(s.admin, p);
  expect({ status: after.status, updatedAt: after.updatedAt }).toEqual({ status: "FINAL_FILES_READY", updatedAt: before.updatedAt });
});

test("D-13 admin final download is 404 FINAL_ZIP_NOT_AVAILABLE without a published final @admin @api @finals", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  await expectError(await s.admin.post(api(s.projectId(), "/finals/download")), 404, "FINAL_ZIP_NOT_AVAILABLE");
  await expectError(await s.admin.post(api(UNKNOWN_ID, "/finals/download")), 404, "FINAL_ZIP_NOT_AVAILABLE");
});

test.fixme("D-11 finals repair without an approved concept is 400 FINAL_REPAIR_REQUIRES_APPROVAL @admin @api @finals", async () => {
  // Needs a FINAL_FILES_READY/DELIVERED scenario with no approved concept; none exists (shared change to fixtures/scenarios).
});
