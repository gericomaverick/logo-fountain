// C-08 concepts list, C-09 concept assets, C-10 concept comments, C-15 read-state (concepts area).
// Only published/approved concepts are used: unpublished-concept behaviour (F-7/DV-7) belongs to story 0.7d.
import { expect, test } from "../../fixtures";
import {
  ADMIN, CLIENT_A, ISO, UNKNOWN_ID, UUID, as, conceptId, expectError, expectJson, expectKeys, projectId, snapshotOf, useScenario,
} from "./_client-helpers";

const CONCEPT_KEYS = ["id", "number", "status", "notes", "createdAt", "updatedAt", "revisionVersion", "imageUrl"];
const DV12 = ["imageKey"]; // additive key allowed by DV-12

test.describe("concepts-ready", () => {
  useScenario("concepts-ready");
  const id = projectId("concepts-ready");
  const c1 = conceptId("concepts-ready", 1);
  const c2 = conceptId("concepts-ready", 2);

  test("C-08 GET concepts lists published concepts by number with signed image URLs and projectStatus @api @client @concepts", async () => {
    for (const who of [CLIENT_A, ADMIN]) {
      const body = await expectJson(await (await as(who)).get(`/api/projects/${id}/concepts`));
      expectKeys(body, ["concepts", "projectStatus"]);
      expect(body.projectStatus).toBe("CONCEPTS_READY");
      expect(body.concepts.map((c: any) => [c.id, c.number, c.status, c.notes])).toEqual([
        [c1, 1, "published", "Concept 1 notes"],
        [c2, 2, "published", "Concept 2 notes"],
      ]);
      for (const c of body.concepts) {
        expectKeys(c, CONCEPT_KEYS, DV12);
        expect(c.revisionVersion).toBe(1);
        expect(() => new URL(c.imageUrl)).not.toThrow();
        expect(c.createdAt).toMatch(ISO);
      }
    }
  });

  test("C-09 GET concepts/{cid}/assets lists every version with a signed URL @api @client @concepts", async () => {
    for (const who of [CLIENT_A, ADMIN]) {
      const body = await expectJson(await (await as(who)).get(`/api/projects/${id}/concepts/${c1}/assets`));
      expectKeys(body, ["assets"]);
      expect(body.assets).toHaveLength(1);
      const [asset] = body.assets;
      expectKeys(asset, ["path", "version", "createdAt", "url", "notes"], DV12);
      expect(asset.version).toBe(1);
      expect(typeof asset.path).toBe("string");
      expect(asset.createdAt).toMatch(ISO);
      expect(() => new URL(asset.url)).not.toThrow();
    }
  });

  test("C-10 comments: GET is empty, POST trims and returns 201 with the author, GET lists ascending @api @client @concepts", async () => {
    const a = await as(CLIENT_A);
    const path = `/api/projects/${id}/concepts/${c1}/comments`;
    expect(await expectJson(await a.get(path))).toEqual({ comments: [] });

    const first = await expectJson(await a.post(path, { data: { body: "  Love the icon  " } }), 201);
    expectKeys(first, ["ok", "comment"]);
    expect(first.ok).toBe(true);
    expectKeys(first.comment, ["id", "body", "createdAt", "author"]);
    expect(first.comment.id).toMatch(UUID);
    expect(first.comment.body).toBe("Love the icon");
    expectKeys(first.comment.author, ["id", "email", "fullName", "isAdmin"]);
    expect(first.comment.author).toMatchObject({ email: CLIENT_A, isAdmin: false });

    const second = await expectJson(await a.post(path, { data: { body: "Maybe bolder?" } }), 201);

    for (const who of [CLIENT_A, ADMIN]) {
      const { comments } = await expectJson(await (await as(who)).get(path));
      expect(comments.map((c: any) => [c.id, c.body])).toEqual([[first.comment.id, "Love the icon"], [second.comment.id, "Maybe bolder?"]]);
    }
    // The other concept's thread is separate.
    expect(await expectJson(await a.get(`/api/projects/${id}/concepts/${c2}/comments`))).toEqual({ comments: [] });
    // Comments write no system message.
    expect((await snapshotOf(a, id)).messages).toHaveLength(3);
  });

  // FIXME(Next bug): an admin's POST returns 500. The route upserts Profile with isAdmin:true
  // (apps/web/src/app/api/projects/[id]/concepts/[conceptId]/comments/route.ts:76); Postgres fires the
  // BEFORE INSERT trigger protect_operator_admin_flag (prisma/migrations/20260901000000_portable_core/
  // migration.sql:527) before ON CONFLICT resolves, so the runtime role gets "operator-owned admin flag".
  // Enable once a decision fixes Next or records the documented contract (201, author.isAdmin true) as a DV.
  test.fixme("C-10 an admin's comment is 201 with author.isAdmin true @api @client @concepts", async () => {
    const res = await expectJson(await (await as(ADMIN)).post(`/api/projects/${id}/concepts/${c1}/comments`, { data: { body: "Thanks!" } }), 201);
    expect(res.comment.author).toMatchObject({ email: ADMIN, isAdmin: true });
  });

  test("C-10 comment bodies must be 1-2000 characters after trimming (400 INVALID_COMMENT_BODY) @api @client @concepts", async () => {
    const a = await as(CLIENT_A);
    const path = `/api/projects/${id}/concepts/${c1}/comments`;
    for (const data of [{}, { body: "" }, { body: "   " }, { body: 42 }, { body: "x".repeat(2001) }]) {
      await expectError(await a.post(path, { data }), 400, "INVALID_COMMENT_BODY");
    }
    const max = await expectJson(await a.post(path, { data: { body: ` ${"x".repeat(2000)} ` } }), 201);
    expect(max.comment.body).toHaveLength(2000);
  });

  test("C-10 comments on a concept outside the project are 404 CONCEPT_NOT_FOUND @api @client @concepts", async () => {
    const a = await as(CLIENT_A);
    await expectError(await a.get(`/api/projects/${id}/concepts/${UNKNOWN_ID}/comments`), 404, "CONCEPT_NOT_FOUND");
    await expectError(await a.post(`/api/projects/${id}/concepts/${UNKNOWN_ID}/comments`, { data: { body: "hi" } }), 404, "CONCEPT_NOT_FOUND");
  });

  test("C-15 POST read-state {area:concepts} clears hasNewConcepts until new concept activity @api @client @concepts", async () => {
    const a = await as(CLIENT_A);
    expect((await snapshotOf(a, id)).hasNewConcepts).toBe(true);
    expect(await expectJson(await a.post(`/api/projects/${id}/read-state`, { data: { area: "concepts" } }))).toEqual({ ok: true });
    const seen = await snapshotOf(a, id);
    expect(seen.hasNewConcepts).toBe(false);
    expect(seen.readState.lastSeenConceptsAt).toMatch(ISO);
    // The stamp is the latest concept activity (a DB timestamp), not the server clock.
    expect(seen.readState.lastSeenConceptsAt).toBe(seen.latestConceptAt);
    expect(seen.hasNewMessages).toBe(true);

    await expectJson(await a.post(`/api/projects/${id}/concepts/${c2}/comments`, { data: { body: "New idea" } }), 201);
    expect((await snapshotOf(a, id)).hasNewConcepts).toBe(true);
  });

  test("C-15 read-state needs area messages or concepts (400 INVALID_AREA) @api @client @concepts @messages", async () => {
    const a = await as(CLIENT_A);
    for (const data of [{}, { area: "files" }, { area: "MESSAGES" }]) {
      await expectError(await a.post(`/api/projects/${id}/read-state`, { data }), 400, "INVALID_AREA");
    }
  });
});

test.describe("awaiting-approval", () => {
  useScenario("awaiting-approval");
  test("C-08 GET concepts shows the approved concept and hides archived ones @api @client @concepts", async () => {
    const id = projectId("awaiting-approval");
    const body = await expectJson(await (await as(CLIENT_A)).get(`/api/projects/${id}/concepts`));
    expect(body.projectStatus).toBe("AWAITING_APPROVAL");
    expect(body.concepts.map((c: any) => [c.number, c.status])).toEqual([[1, "approved"]]);
  });
});

test.describe("awaiting-brief", () => {
  useScenario("awaiting-brief");
  test("C-08 GET concepts is empty before any concept is published @api @client @concepts", async () => {
    const body = await expectJson(await (await as(CLIENT_A)).get(`/api/projects/${projectId("awaiting-brief")}/concepts`));
    expect(body).toEqual({ concepts: [], projectStatus: "AWAITING_BRIEF" });
  });

  test("C-08 an admin asking for an unknown project gets an empty list with projectStatus null @api @client @concepts", async () => {
    const body = await expectJson(await (await as(ADMIN)).get(`/api/projects/${UNKNOWN_ID}/concepts`));
    expect(body).toEqual({ concepts: [], projectStatus: null });
  });
});
