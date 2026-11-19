// C-06 brief draft GET/PUT/DELETE, C-07 brief GET/POST. Spec: brownfield/api-client.md, business-rules §7.
import { expect, test } from "../../fixtures";
import {
  ADMIN, BRIEF_KEYS, CLIENT_A, ISO, UUID, VALID_BRIEF, as, expectError, expectJson, expectKeys, projectId, snapshotOf, useScenario,
} from "./_client-helpers";

const BRIEF_RECEIVED = "Brief received. Your designer will review and reply soon.";

test.describe("draft (brief-draft)", () => {
  useScenario("brief-draft");
  const id = projectId("brief-draft");
  const path = `/api/projects/${id}/brief/draft`;

  test("C-06 GET brief/draft returns the normalised draft answers and updatedAt @api @client @brief", async () => {
    const body = await expectJson(await (await as(CLIENT_A)).get(path));
    expectKeys(body, ["draft"]);
    expectKeys(body.draft, ["answers", "updatedAt"]);
    expectKeys(body.draft.answers, BRIEF_KEYS);
    expect(body.draft.answers).toMatchObject({ brandName: "Northvale Coffee", industry: "Coffee roastery", offerSummary: "" });
    expect(body.draft.updatedAt).toMatch(ISO);
  });

  test("C-06 PUT brief/draft trims, truncates, drops unknown keys and fills missing ones @api @client @brief", async () => {
    const a = await as(CLIENT_A);
    const res = await expectJson(await a.put(path, { data: { answers: { brandName: `  ${"x".repeat(130)}  `, industry: " Bakery ", bogus: "drop me" } } }));
    expectKeys(res, ["ok", "updatedAt"]);
    expect(res.ok).toBe(true);
    expect(res.updatedAt).toMatch(ISO);

    const { draft } = await expectJson(await a.get(path));
    expectKeys(draft.answers, BRIEF_KEYS);
    expect(draft.answers.brandName).toBe("x".repeat(120));
    expect(draft.answers.industry).toBe("Bakery");
    expect(draft.answers.offerSummary).toBe("");
    expect(draft.updatedAt).toBe(res.updatedAt);
  });

  test("C-06 PUT brief/draft without an answers object is 400 INVALID_BRIEF_DRAFT_PAYLOAD @api @client @brief", async () => {
    const a = await as(CLIENT_A);
    await expectError(await a.put(path, { data: {} }), 400, "INVALID_BRIEF_DRAFT_PAYLOAD");
    await expectError(await a.put(path, { data: { answers: "text" } }), 400, "INVALID_BRIEF_DRAFT_PAYLOAD");
    await expectError(await a.put(path, { data: Buffer.from("not json"), headers: { "content-type": "application/json" } }), 400, "INVALID_BRIEF_DRAFT_PAYLOAD");
  });

  test("C-06 DELETE brief/draft is idempotent and clears hasBriefDraft @api @client @brief", async () => {
    const a = await as(CLIENT_A);
    expect((await snapshotOf(a, id)).hasBriefDraft).toBe(true);
    expect(await expectJson(await a.delete(path))).toEqual({ ok: true });
    expect(await expectJson(await a.delete(path))).toEqual({ ok: true });
    expect(await expectJson(await a.get(path))).toEqual({ draft: null });
    expect((await snapshotOf(a, id)).hasBriefDraft).toBe(false);
  });

  test("C-06 brief/draft is member-only: an admin gets 404 PROJECT_NOT_FOUND on GET, PUT and DELETE @api @client @brief @authz", async () => {
    const admin = await as(ADMIN);
    await expectError(await admin.get(path), 404, "PROJECT_NOT_FOUND");
    await expectError(await admin.put(path, { data: { answers: VALID_BRIEF } }), 404, "PROJECT_NOT_FOUND");
    await expectError(await admin.delete(path), 404, "PROJECT_NOT_FOUND");
  });

  test("C-07 POST brief submits version 1, moves to BRIEF_SUBMITTED, deletes the draft and posts the system message @api @client @brief", async () => {
    const a = await as(CLIENT_A);
    const res = await expectJson(await a.post(`/api/projects/${id}/brief`, { data: { ...VALID_BRIEF, brandName: "  Parity Bakery  " } }));
    expectKeys(res, ["ok", "briefId", "version"]);
    expect(res).toMatchObject({ ok: true, version: 1 });
    expect(res.briefId).toMatch(UUID);

    const { brief } = await expectJson(await a.get(`/api/projects/${id}/brief`));
    expectKeys(brief, ["id", "version", "answers", "createdAt", "createdBy"]);
    expect(brief).toMatchObject({ id: res.briefId, version: 1, answers: VALID_BRIEF });
    expect(brief.createdBy).toMatch(UUID);

    expect(await expectJson(await a.get(path))).toEqual({ draft: null });
    const s = await snapshotOf(a, id);
    expect(s.status).toBe("BRIEF_SUBMITTED");
    expect(s.hasBriefDraft).toBe(false);
    expect(s.latestBrief).toMatchObject({ version: 1, answers: VALID_BRIEF });
    expect(s.messages.map((m: any) => [m.kind, m.body])).toEqual([["system", BRIEF_RECEIVED]]);
    expect(s.timeline.find((t: any) => t.state === "BRIEF_SUBMITTED")).toMatchObject({ current: true, timestamp: expect.stringMatching(ISO) });

    // Submitted once: a second POST and a further draft save are locked.
    await expectError(await a.post(`/api/projects/${id}/brief`, { data: VALID_BRIEF }), 400, "BRIEF_LOCKED");
    await expectError(await a.put(path, { data: { answers: VALID_BRIEF } }), 400, "BRIEF_LOCKED");
  });

  test("C-07 POST brief with missing required fields is 400 INVALID_BRIEF_PAYLOAD naming them @api @client @brief", async () => {
    const a = await as(CLIENT_A);
    const { usageContexts: _omit, ...withoutUsage } = VALID_BRIEF;
    const body = await expectError(await a.post(`/api/projects/${id}/brief`, { data: withoutUsage }), 400, "INVALID_BRIEF_PAYLOAD");
    expect(body.error.details?.nextStep).toBe("Fill all required brief fields (usageContexts).");
    const empty = await expectError(await a.post(`/api/projects/${id}/brief`, { data: {} }), 400, "INVALID_BRIEF_PAYLOAD");
    expect(String(empty.error.details?.nextStep)).toMatch(/^Fill all required brief fields \(.+\)\.$/);
    // Nothing changed.
    expect((await snapshotOf(a, id)).status).toBe("AWAITING_BRIEF");
  });

  test("C-07 POST brief is member-only: an admin gets 404 PROJECT_NOT_FOUND @api @client @brief @authz", async () => {
    await expectError(await (await as(ADMIN)).post(`/api/projects/${id}/brief`, { data: VALID_BRIEF }), 404, "PROJECT_NOT_FOUND");
  });
});

test.describe("no draft (awaiting-brief)", () => {
  useScenario("awaiting-brief");
  const id = projectId("awaiting-brief");

  test("C-06/C-07 a fresh project has no draft and no brief; a PUT creates the draft @api @client @brief", async () => {
    const a = await as(CLIENT_A);
    expect(await expectJson(await a.get(`/api/projects/${id}/brief/draft`))).toEqual({ draft: null });
    expect(await expectJson(await a.get(`/api/projects/${id}/brief`))).toEqual({ brief: null });
    await expectJson(await a.put(`/api/projects/${id}/brief/draft`, { data: { answers: { brandName: "New" } } }));
    expect((await expectJson(await a.get(`/api/projects/${id}/brief/draft`))).draft.answers.brandName).toBe("New");
    expect((await snapshotOf(a, id)).hasBriefDraft).toBe(true);
  });
});

test.describe("submitted (brief-submitted)", () => {
  useScenario("brief-submitted");
  const id = projectId("brief-submitted");

  test("C-07 GET brief returns the latest version to the member and to an admin @api @client @brief", async () => {
    for (const who of [CLIENT_A, ADMIN]) {
      const { brief } = await expectJson(await (await as(who)).get(`/api/projects/${id}/brief`));
      expect(brief).toMatchObject({ version: 1, answers: { brandName: "Northvale Coffee" } });
      expect(brief.createdAt).toMatch(ISO);
    }
  });

  test("C-06/C-07 once BRIEF_SUBMITTED, POST brief and PUT draft are 400 BRIEF_LOCKED @api @client @brief", async () => {
    const a = await as(CLIENT_A);
    const locked = await expectError(await a.post(`/api/projects/${id}/brief`, { data: VALID_BRIEF }), 400, "BRIEF_LOCKED");
    expect(locked.error.details).toEqual({ nextStep: "Brief can only be submitted once." });
    await expectError(await a.put(`/api/projects/${id}/brief/draft`, { data: { answers: VALID_BRIEF } }), 400, "BRIEF_LOCKED");
    // DELETE stays idempotent whatever the status.
    expect(await expectJson(await a.delete(`/api/projects/${id}/brief/draft`))).toEqual({ ok: true });
  });
});
