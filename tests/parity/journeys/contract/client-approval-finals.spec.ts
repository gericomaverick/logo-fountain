// C-12 approve a published concept, C-13 final ZIP download. Spec: brownfield/api-client.md.
// Emails (N-07/N-08) are asserted by the UI journeys with Mailpit (story 0.8c). Signed URLs are not fetched.
import { expect, test } from "../../fixtures";
import {
  ADMIN, CLIENT_A, CLIENT_B, UNKNOWN_ID, as, conceptId, expectError, expectJson, expectKeys, projectId, snapshotOf, useScenario,
} from "./_client-helpers";

const approve = (scenario: string, key = "p1") => `/api/projects/${projectId(scenario, key)}/approve`;
const finals = (scenario: string, key = "p1") => `/api/projects/${projectId(scenario, key)}/finals`;

test.describe("approve (concepts-ready)", () => {
  useScenario("concepts-ready");
  const id = projectId("concepts-ready");
  const c1 = conceptId("concepts-ready", 1);
  const c2 = conceptId("concepts-ready", 2);

  test("C-12 POST approve approves the concept, archives the others and moves to AWAITING_APPROVAL @api @client @approval", async () => {
    const a = await as(CLIENT_A);
    const res = await expectJson(await a.post(approve("concepts-ready"), { data: { conceptId: ` ${c2} ` } }));
    expectKeys(res, ["ok", "concept", "project"]);
    expect(res).toEqual({ ok: true, concept: { id: c2, number: 2, status: "approved" }, project: { id, status: "AWAITING_APPROVAL" } });

    const list = await expectJson(await a.get(`/api/projects/${id}/concepts`));
    expect(list.concepts.map((c: any) => [c.id, c.status])).toEqual([[c2, "approved"]]);
    const s = await snapshotOf(a, id);
    expect(s.status).toBe("AWAITING_APPROVAL");
    expect(s.overviewStatus).toBe("APPROVED");
    expect(s.finalZip).toEqual({ available: false, url: null, assetId: null });

    // The archived concept can no longer be approved, and neither can the approved one.
    await expectError(await a.post(approve("concepts-ready"), { data: { conceptId: c1 } }), 404, "CONCEPT_NOT_FOUND");
    await expectError(await a.post(approve("concepts-ready"), { data: { conceptId: c2 } }), 404, "CONCEPT_NOT_FOUND");
  });

  test("C-12 approve needs a conceptId (400 INVALID_CONCEPT_ID) of a published concept (404 CONCEPT_NOT_FOUND) @api @client @approval", async () => {
    const a = await as(CLIENT_A);
    for (const data of [{}, { conceptId: "" }, { conceptId: "  " }, { conceptId: 7 }]) {
      await expectError(await a.post(approve("concepts-ready"), { data }), 400, "INVALID_CONCEPT_ID");
    }
    const missing = await expectError(await a.post(approve("concepts-ready"), { data: { conceptId: UNKNOWN_ID } }), 404, "CONCEPT_NOT_FOUND");
    expect(missing.error.details).toEqual({ nextStep: "Pick a published concept from this project." });
    expect((await snapshotOf(a, id)).status).toBe("CONCEPTS_READY");
  });

  test("C-12 approve is member-only: an admin gets 404 PROJECT_NOT_FOUND @api @client @approval @authz", async () => {
    await expectError(await (await as(ADMIN)).post(approve("concepts-ready"), { data: { conceptId: c1 } }), 404, "PROJECT_NOT_FOUND");
  });

  test("C-13 finals before approval and final files are 404 FINAL_ZIP_NOT_AVAILABLE @api @client @finals", async () => {
    const body = await expectError(await (await as(CLIENT_A)).post(finals("concepts-ready")), 404, "FINAL_ZIP_NOT_AVAILABLE");
    expect(body.error.details).toEqual({ nextStep: "Final files require approval and a completed delivery state." });
  });
});

test.describe("approve (revision-reserved)", () => {
  useScenario("revision-reserved");
  test("C-12 approving during REVISIONS_IN_PROGRESS is 400 INVALID_PROJECT_STATUS_TRANSITION @api @client @approval", async () => {
    const body = await expectError(
      await (await as(CLIENT_A)).post(approve("revision-reserved"), { data: { conceptId: conceptId("revision-reserved", 1) } }),
      400,
      "INVALID_PROJECT_STATUS_TRANSITION",
    );
    expect(body.error.details?.allowed).toEqual(["CONCEPTS_READY", "ON_HOLD", "CANCELLED", "REFUNDED"]);
  });
});

test.describe("finals (awaiting-approval)", () => {
  useScenario("awaiting-approval");
  test("C-13 finals while AWAITING_APPROVAL without a final ZIP are 404 FINAL_ZIP_NOT_AVAILABLE @api @client @finals", async () => {
    await expectError(await (await as(CLIENT_A)).post(finals("awaiting-approval")), 404, "FINAL_ZIP_NOT_AVAILABLE");
  });
});

test.describe("finals (final-files-ready)", () => {
  useScenario("final-files-ready");
  const id = projectId("final-files-ready");

  test("C-13 the first client download returns a signed URL and marks the project DELIVERED @api @client @finals", async () => {
    const a = await as(CLIENT_A);
    expect((await snapshotOf(a, id)).status).toBe("FINAL_FILES_READY");
    const res = await expectJson(await a.post(finals("final-files-ready")));
    expectKeys(res, ["url"]);
    expect(() => new URL(res.url)).not.toThrow();

    const s = await snapshotOf(a, id);
    expect(s.status).toBe("DELIVERED");
    expect(s.finalZip).toMatchObject({ available: true, url: null });
    expect(s.timeline.find((t: any) => t.state === "DELIVERED")).toMatchObject({ current: true, timestamp: expect.any(String) });

    // Later downloads keep working and keep the status.
    expectKeys(await expectJson(await a.post(finals("final-files-ready"))), ["url"]);
    expect((await snapshotOf(a, id)).status).toBe("DELIVERED");
  });

  test("C-13 finals are member-only and answer 404 FINAL_ZIP_NOT_AVAILABLE (not PROJECT_NOT_FOUND) to an admin @api @client @finals @authz", async () => {
    await expectError(await (await as(ADMIN)).post(finals("final-files-ready")), 404, "FINAL_ZIP_NOT_AVAILABLE");
    expect((await snapshotOf(await as(CLIENT_A), id)).status).toBe("FINAL_FILES_READY");
  });
});

test.describe("finals (delivered)", () => {
  useScenario("delivered");
  test("C-13 a DELIVERED project keeps serving the final ZIP @api @client @finals", async () => {
    const a = await as(CLIENT_A);
    expectKeys(await expectJson(await a.post(finals("delivered"))), ["url"]);
    expect((await snapshotOf(a, projectId("delivered"))).status).toBe("DELIVERED");
  });
});

test.describe("finals (two-tenants)", () => {
  useScenario("two-tenants");
  test("C-13 another tenant's finals are 404 FINAL_ZIP_NOT_AVAILABLE @api @client @finals @authz", async () => {
    await expectError(await (await as(CLIENT_B)).post(finals("two-tenants", "pA")), 404, "FINAL_ZIP_NOT_AVAILABLE");
  });
});
