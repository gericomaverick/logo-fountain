// C-02 project list and snapshot (+ the snapshot JSON Schema for every scenario), C-16 entitlements.
// Spec: brownfield/api-client.md, business-rules-and-notifications.md §3-§4.
import { expect, test } from "../../fixtures";
import { loadScenario, seed } from "../../adapters/seed";
import {
  ADMIN, CLIENT_A, CLIENT_B, UNKNOWN_ID, as, anonymous, expectError, expectJson, expectKeys, projectId, snapshotOf, snapshotSchema, useScenario, validate,
} from "./_client-helpers";

const SCENARIOS_WITH_PROJECTS = [
  "fresh-purchase", "awaiting-brief", "brief-draft", "brief-submitted", "concepts-ready", "revision-reserved",
  "revisions-exhausted", "awaiting-approval", "final-files-ready", "delivered", "on-hold", "two-tenants",
];
const FINAL_STATES = new Set(["FINAL_FILES_READY", "DELIVERED"]);

test.describe("snapshot schema", () => {
  // useScenario takes the seed lock; the loop then reseeds each scenario while the lock is held.
  useScenario("admin-only");

  test("C-02/X-03 snapshot matches snapshot.schema.json and the seeded facts for every scenario @api @client @contract", async () => {
    for (const name of SCENARIOS_WITH_PROJECTS) {
      seed(name);
      const scenario = loadScenario(name);
      for (const p of scenario.projects as Array<Record<string, any>>) {
        const memberKey = p.client.members[0];
        const member = scenario.users.find((u) => u.key === memberKey)!;
        // A client without a password (fresh-purchase) cannot sign in; admins can read any project.
        const ctx = await as(member.password ? member.email : ADMIN);
        const s = await test.step(`${name}/${p.key}`, () => snapshotOf(ctx, projectId(name, p.key)));
        const where = `${name}/${p.key}`;
        expect(validate(s, snapshotSchema), where).toEqual([]);

        const visible = (p.concepts ?? []).filter((c: any) => c.status === "published" || c.status === "approved");
        const approved = visible.some((c: any) => c.status === "approved");
        const finalAvailable = Boolean(p.finalZip) && approved && FINAL_STATES.has(p.status);
        const [cl, cc, cr] = p.entitlements.concepts;
        const [rl, rc, rr] = p.entitlements.revisions;

        expect(s.projectId, where).toBe(projectId(name, p.key));
        expect(s.status, where).toBe(p.status);
        expect(s.packageCode, where).toBe(p.package);
        expect(s.clientContact, where).toEqual({ fullName: `${member.firstName} ${member.lastName}`, email: member.email });
        expect(s.entitlements, where).toEqual({ concepts: Math.max(cl - cc - cr, 0), revisions: Math.max(rl - rc - rr, 0) });
        expect(s.entitlementUsage.revisions, where).toMatchObject({ limit: rl, consumed: rc, reserved: rr, configured: true });
        expect(s.concepts.map((c: any) => c.number), where).toEqual(visible.map((c: any) => c.number).sort((a: number, b: number) => b - a));
        expect(s.latestConcepts, where).toEqual(s.concepts.slice(0, 5));
        expect(s.revisionRequests.length, where).toBe((p.revisionRequests ?? []).length);
        expect(s.latestRevisionRequests, where).toEqual(s.revisionRequests.slice(0, 5));
        expect(s.messages.map((m: any) => [m.kind, m.body]), where).toEqual((p.messages ?? []).map((m: any) => [m.kind, m.body]));
        expect(s.latestBrief?.version ?? null, where).toBe(p.brief ? 1 : null);
        expect(s.hasBriefDraft, where).toBe(Boolean(p.briefDraft));
        expect(s.finalZip.available, where).toBe(finalAvailable);
        expect(s.finalZip.url, where).toBeNull();
        expect(s.finalZip.assetId === null, where).toBe(!finalAvailable);
        expect(s.latestOrder, where).toMatchObject({ status: p.order.status, stripeCheckoutSessionId: p.order.sessionId });
        expect(s.stuck, where).toBe(false);
        expect(s.stuckReason, where).toBeNull();
        expect(s.timeline.filter((step: any) => step.current).map((step: any) => step.state), where).toEqual(
          [approved && p.status === "AWAITING_APPROVAL" ? "APPROVED" : p.status],
        );
      }
    }
  });
});

test.describe("project list", () => {
  useScenario("two-tenants");

  test("C-02 GET /api/projects lists only the caller's projects as {id,status,packageCode} @api @client", async () => {
    const body = await expectJson(await (await as(CLIENT_A)).get("/api/projects"));
    expectKeys(body, ["projects"]);
    expect(body.projects).toEqual([{ id: projectId("two-tenants", "pA"), status: "CONCEPTS_READY", packageCode: "professional" }]);

    const b = await expectJson(await (await as(CLIENT_B)).get("/api/projects"));
    expect(b.projects.map((p: any) => p.id)).toEqual([projectId("two-tenants", "pB")]);
  });

  test("C-02 GET /api/projects is membership-based: an admin without memberships gets an empty list @api @client", async () => {
    const body = await expectJson(await (await as(ADMIN)).get("/api/projects"));
    expect(body).toEqual({ projects: [] });
  });

  test("C-02 GET /api/projects requires a session (401 UNAUTHORIZED) @api @client @authz", async () => {
    const body = await expectError(await (await anonymous()).get("/api/projects"), 401, "UNAUTHORIZED");
    expect(body.error).toEqual({ message: "Unauthorized", code: "UNAUTHORIZED", details: { nextStep: "Sign in and retry." } });
  });
});

test.describe("snapshot access", () => {
  useScenario("two-tenants");

  test("C-02 GET /api/projects/{id} returns {snapshot} to a member and to an admin @api @client", async () => {
    const pA = projectId("two-tenants", "pA");
    const mine = await expectJson(await (await as(CLIENT_A)).get(`/api/projects/${pA}`));
    expectKeys(mine, ["snapshot"]);
    expect(mine.snapshot.projectId).toBe(pA);
    const admin = await snapshotOf(await as(ADMIN), pA);
    expect(admin.projectId).toBe(pA);
  });

  test("C-02 GET /api/projects/{id} hides other tenants' and unknown projects (404 PROJECT_NOT_FOUND) @api @client @authz", async () => {
    const a = await as(CLIENT_A);
    await expectError(await a.get(`/api/projects/${projectId("two-tenants", "pB")}`), 404, "PROJECT_NOT_FOUND");
    await expectError(await a.get(`/api/projects/${UNKNOWN_ID}`), 404, "PROJECT_NOT_FOUND");
    await expectError(await (await as(ADMIN)).get(`/api/projects/${UNKNOWN_ID}`), 404, "PROJECT_NOT_FOUND");
    await expectError(await (await anonymous()).get(`/api/projects/${projectId("two-tenants", "pA")}`), 401, "UNAUTHORIZED");
  });
});

test.describe("snapshot rules", () => {
  test.describe("awaiting-approval", () => {
    useScenario("awaiting-approval");
    test("C-02 an approved concept without finals shows AWAITING_APPROVAL with the APPROVED overview badge @api @client", async () => {
      const s = await snapshotOf(await as(CLIENT_A), projectId("awaiting-approval"));
      expect(s.status).toBe("AWAITING_APPROVAL");
      expect(s.overviewStatus).toBe("APPROVED");
      expect(s.concepts.map((c: any) => [c.number, c.status])).toEqual([[1, "approved"]]);
      // The derived APPROVED step is the current one; AWAITING_APPROVAL is completed.
      expect(s.timeline.find((t: any) => t.state === "APPROVED")).toMatchObject({ completed: false, current: true });
      expect(s.timeline.find((t: any) => t.state === "AWAITING_APPROVAL")).toMatchObject({ completed: true, current: false });
    });
  });

  test.describe("concepts-ready", () => {
    useScenario("concepts-ready");
    test("C-02 snapshot concepts are number-desc with signed preview URLs; unseen activity flags are set @api @client", async () => {
      const s = await snapshotOf(await as(CLIENT_A), projectId("concepts-ready"));
      expect(s.concepts.map((c: any) => c.number)).toEqual([2, 1]);
      for (const c of s.concepts) {
        expect(typeof c.imageUrl).toBe("string");
        expect(c.revisionVersion).toBe(1);
      }
      expect(s.readState).toEqual({});
      expect(s.hasNewMessages).toBe(true);
      expect(s.hasNewConcepts).toBe(true);
      expect(s.latestMessageAt).toBe(s.messages.filter((m: any) => m.kind !== "system").at(-1).createdAt);
      expect(s.messages[0].sender).toMatchObject({ email: ADMIN });
    });
  });

  test.describe("awaiting-brief", () => {
    useScenario("awaiting-brief");
    test("C-02 an empty project omits latestMessageAt and latestConceptAt rather than sending null @api @client", async () => {
      const s = await snapshotOf(await as(CLIENT_A), projectId("awaiting-brief"));
      expect(s.concepts).toEqual([]);
      expect(s.messages).toEqual([]);
      expect(s.latestBrief).toBeNull();
      expect("latestMessageAt" in s).toBe(false);
      expect("latestConceptAt" in s).toBe(false);
      expect(s.hasNewMessages).toBe(false);
      expect(s.hasNewConcepts).toBe(false);
      expect(s.primaryCta).toEqual(expect.any(String));
    });
  });
});

test.describe("entitlements", () => {
  test.describe("revision-reserved", () => {
    useScenario("revision-reserved");
    test("C-16 GET /api/projects/{id}/entitlements returns remaining = limit - consumed - reserved @api @client @entitlements", async () => {
      const body = await expectJson(await (await as(CLIENT_A)).get(`/api/projects/${projectId("revision-reserved")}/entitlements`));
      expect(body).toEqual({ entitlements: { concepts: 0, revisions: 1 } });
    });
  });

  test.describe("revisions-exhausted", () => {
    useScenario("revisions-exhausted");
    test("C-16 entitlements clamp at zero when revisions are used up @api @client @entitlements", async () => {
      const body = await expectJson(await (await as(CLIENT_A)).get(`/api/projects/${projectId("revisions-exhausted")}/entitlements`));
      expect(body).toEqual({ entitlements: { concepts: 0, revisions: 0 } });
    });
  });

  test.describe("two-tenants", () => {
    useScenario("two-tenants");
    test("C-16 entitlements are member-only: anonymous 401, other tenant and admin 404 PROJECT_NOT_FOUND @api @client @entitlements @authz", async () => {
      const path = `/api/projects/${projectId("two-tenants", "pA")}/entitlements`;
      await expectError(await (await anonymous()).get(path), 401, "UNAUTHORIZED");
      await expectError(await (await as(CLIENT_B)).get(path), 404, "PROJECT_NOT_FOUND");
      await expectError(await (await as(ADMIN)).get(path), 404, "PROJECT_NOT_FOUND");
      const ok = await expectJson(await (await as(CLIENT_A)).get(path));
      expect(ok).toEqual({ entitlements: { concepts: 0, revisions: 2 } });
    });
  });
});
