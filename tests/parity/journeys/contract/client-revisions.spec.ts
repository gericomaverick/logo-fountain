// C-11 revision requests: atomic reserve, status change, system message. Spec: brownfield/api-client.md.
// The admin email (N-12) is asserted by the UI journeys with Mailpit (story 0.8b), not here.
import { expect, test } from "../../fixtures";
import {
  ADMIN, CLIENT_A, ISO, UNKNOWN_ID, UUID, as, conceptId, expectError, expectJson, expectKeys, projectId, snapshotOf, useScenario,
} from "./_client-helpers";

const path = (scenario: string) => `/api/projects/${projectId(scenario)}/revision-requests`;

test.describe("concepts-ready", () => {
  useScenario("concepts-ready");
  const id = projectId("concepts-ready");
  const c1 = conceptId("concepts-ready", 1);

  test("C-11 POST revision-requests reserves one revision and moves the project to REVISIONS_IN_PROGRESS @api @client @revisions", async () => {
    const a = await as(CLIENT_A);
    const res = await expectJson(await a.post(path("concepts-ready"), { data: { body: "  Bolder please  ", conceptId: c1 } }), 201);
    expectKeys(res, ["ok", "revisionRequest", "project"]);
    expect(res.ok).toBe(true);
    expectKeys(res.revisionRequest, ["id", "projectId", "conceptId", "status", "body", "createdAt"]);
    expect(res.revisionRequest).toMatchObject({ projectId: id, conceptId: c1, status: "requested", body: "Bolder please" });
    expect(res.revisionRequest.id).toMatch(UUID);
    expect(res.revisionRequest.createdAt).toMatch(ISO);
    expect(res.project).toEqual({ id, status: "REVISIONS_IN_PROGRESS" });

    expect(await expectJson(await a.get(`/api/projects/${id}/entitlements`))).toEqual({ entitlements: { concepts: 0, revisions: 1 } });
    const s = await snapshotOf(a, id);
    expect(s.status).toBe("REVISIONS_IN_PROGRESS");
    expect(s.entitlementUsage.revisions).toMatchObject({ limit: 2, consumed: 0, reserved: 1, remaining: 1 });
    expect(s.revisionRequests[0]).toMatchObject({ id: res.revisionRequest.id, status: "requested", concept: { id: c1, number: 1 }, user: { email: CLIENT_A } });
    expect(s.messages.at(-1)).toMatchObject({ kind: "system", body: `Revision request received (${res.revisionRequest.id.slice(0, 8)}).` });
  });

  test("C-11 the body must be 1-5000 characters and conceptId is required (400 INVALID_BODY) @api @client @revisions", async () => {
    const a = await as(CLIENT_A);
    for (const data of [{}, { body: "x" }, { conceptId: c1 }, { body: "   ", conceptId: c1 }, { body: "x".repeat(5001), conceptId: c1 }, { body: "x", conceptId: "  " }]) {
      await expectError(await a.post(path("concepts-ready"), { data }), 400, "INVALID_BODY");
    }
    const max = await expectJson(await a.post(path("concepts-ready"), { data: { body: "y".repeat(5000), conceptId: c1 } }), 201);
    expect(max.revisionRequest.body).toHaveLength(5000);
  });

  test("C-11 a concept outside the project is 400 CONCEPT_NOT_FOUND and reserves nothing @api @client @revisions", async () => {
    const a = await as(CLIENT_A);
    await expectError(await a.post(path("concepts-ready"), { data: { body: "x", conceptId: UNKNOWN_ID } }), 400, "CONCEPT_NOT_FOUND");
    expect(await expectJson(await a.get(`/api/projects/${id}/entitlements`))).toEqual({ entitlements: { concepts: 0, revisions: 2 } });
    expect((await snapshotOf(a, id)).status).toBe("CONCEPTS_READY");
  });

  test("C-11 revision-requests are member-only: an admin gets 404 PROJECT_NOT_FOUND @api @client @revisions @authz", async () => {
    await expectError(await (await as(ADMIN)).post(path("concepts-ready"), { data: { body: "x", conceptId: c1 } }), 404, "PROJECT_NOT_FOUND");
  });
});

test.describe("revision-reserved", () => {
  useScenario("revision-reserved");
  const id = projectId("revision-reserved");
  const c2 = conceptId("revision-reserved", 2);

  test("C-11 while REVISIONS_IN_PROGRESS a further request reserves the last revision, then 400 NO_REVISIONS_REMAINING @api @client @revisions", async () => {
    const a = await as(CLIENT_A);
    const res = await expectJson(await a.post(path("revision-reserved"), { data: { body: "Also concept 2", conceptId: c2 } }), 201);
    expect(res.project).toEqual({ id, status: "REVISIONS_IN_PROGRESS" });
    expect(await expectJson(await a.get(`/api/projects/${id}/entitlements`))).toEqual({ entitlements: { concepts: 0, revisions: 0 } });

    const none = await expectError(await a.post(path("revision-reserved"), { data: { body: "One more", conceptId: c2 } }), 400, "NO_REVISIONS_REMAINING");
    expect(none.error.details).toEqual({ nextStep: "Buy a revision add-on to continue." });
    const s = await snapshotOf(a, id);
    expect(s.entitlementUsage.revisions).toMatchObject({ limit: 2, consumed: 0, reserved: 2, remaining: 0 });
    expect(s.revisionRequests).toHaveLength(2);
  });
});

test.describe("revisions-exhausted", () => {
  useScenario("revisions-exhausted");
  test("C-11 with no revisions left the request is 400 NO_REVISIONS_REMAINING and the status is unchanged @api @client @revisions", async () => {
    const a = await as(CLIENT_A);
    await expectError(
      await a.post(path("revisions-exhausted"), { data: { body: "Again", conceptId: conceptId("revisions-exhausted", 1) } }),
      400,
      "NO_REVISIONS_REMAINING",
    );
    const s = await snapshotOf(a, projectId("revisions-exhausted"));
    expect(s.status).toBe("CONCEPTS_READY");
    expect(s.revisionRequests.map((r: any) => r.status)).toEqual(["delivered"]);
  });
});

test.describe("awaiting-approval", () => {
  useScenario("awaiting-approval");
  test("C-11 a project that cannot enter revisions is 400 INVALID_PROJECT_STATUS_TRANSITION with details.allowed @api @client @revisions", async () => {
    const body = await expectError(
      await (await as(CLIENT_A)).post(path("awaiting-approval"), { data: { body: "Change", conceptId: conceptId("awaiting-approval", 1) } }),
      400,
      "INVALID_PROJECT_STATUS_TRANSITION",
    );
    expect(body.error.details?.allowed).toEqual(["FINAL_FILES_READY", "ON_HOLD", "CANCELLED", "REFUNDED"]);
  });
});
