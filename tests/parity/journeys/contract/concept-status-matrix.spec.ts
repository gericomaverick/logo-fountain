// L6 client concept-status matrix (story 0.7d, DV-7 / F-7). Scenario concept-statuses: client A's CONCEPTS_READY
// project with concept 1 draft, 2 deleted, 3 archived, 4 published, 5 approved.
// Every client route taking a concept ID (assets, comments GET/POST, revision-requests, approve) × status.
// - Cells where Next already hides the concept are plain tests (current behaviour = target).
// - Cells where Next leaks it are @deviation tests asserting the Laravel target (listed in
//   expected-next-failures.txt): the concept resolves only through visibleToClient (published, approved), and a
//   hidden concept answers exactly like a missing one. Revision requests need `published`; their "missing"
//   answer is 400 CONCEPT_NOT_FOUND (revision-requests/route.ts:62, pinned in client-authz.spec.ts), so hidden
//   concepts there are 400 too. Everywhere else "missing" is 404 CONCEPT_NOT_FOUND.
import type { APIResponse } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { CLIENT_A, UNKNOWN_ID, anonymous, as, conceptId, expectError, expectJson, projectId, useScenario } from "./_client-helpers";

useScenario("concept-statuses");

const S = "concept-statuses";
const id = projectId(S);
const NUMBER = { draft: 1, deleted: 2, archived: 3, published: 4, approved: 5 } as const;
type Status = keyof typeof NUMBER;
const cid = (status: Status) => conceptId(S, NUMBER[status]);

const assetsPath = (concept: string) => `/api/projects/${id}/concepts/${concept}/assets`;
const commentsPath = (concept: string) => `/api/projects/${id}/concepts/${concept}/comments`;

async function client() {
  return as(CLIENT_A);
}

/** The response for `concept` is byte-for-byte the response for a concept that doesn't exist. */
async function expectLikeMissing(send: (concept: string) => Promise<APIResponse>, concept: string, status: number) {
  const missing = await send(UNKNOWN_ID);
  const hidden = await send(concept);
  const body = await expectError(hidden, status, "CONCEPT_NOT_FOUND");
  expect(missing.status()).toBe(status);
  expect(body).toEqual(await missing.json());
}

async function revisionsLeft(): Promise<number> {
  const body = await expectJson(await (await client()).get(`/api/projects/${id}/entitlements`));
  return body.entitlements.revisions;
}

// ---------------------------------------------------------------------------------------------
// Current behaviour that is already the target.

test("C-08/C-02 the concepts list and the snapshot show only the published and approved concepts @api @authz @concepts", async () => {
  const a = await client();
  const list = await expectJson(await a.get(`/api/projects/${id}/concepts`));
  expect(list.concepts.map((c: { id: string; status: string }) => [c.id, c.status])).toEqual([
    [cid("published"), "published"],
    [cid("approved"), "approved"],
  ]);
  const { snapshot } = await expectJson(await a.get(`/api/projects/${id}`));
  expect(snapshot.concepts.map((c: { id: string }) => c.id).sort()).toEqual([cid("published"), cid("approved")].sort());
});

for (const status of ["published", "approved"] as const) {
  test(`C-09 assets of the ${status} concept list its file @api @authz @concepts`, async () => {
    const body = await expectJson(await (await client()).get(assetsPath(cid(status))));
    expect(body.assets).toHaveLength(1);
    expect(body.assets[0].path).toContain(`/${cid(status)}/v1.`);
  });

  test(`C-10 comments GET and POST on the ${status} concept succeed @api @authz @concepts`, async () => {
    const a = await client();
    expect(await expectJson(await a.get(commentsPath(cid(status))))).toEqual({ comments: [] });
    const posted = await expectJson(await a.post(commentsPath(cid(status)), { data: { body: `On ${status}` } }), 201);
    expect(posted.comment.body).toBe(`On ${status}`);
  });
}

test("C-11 a revision request on the published concept is 201 and reserves a revision @api @authz @revisions", async () => {
  const a = await client();
  const body = await expectJson(await a.post(`/api/projects/${id}/revision-requests`, { data: { body: "Bolder", conceptId: cid("published") } }), 201);
  expect(body.revisionRequest.conceptId).toBe(cid("published"));
  expect(await revisionsLeft()).toBe(1);
});

for (const status of ["draft", "deleted", "archived", "approved"] as const) {
  test(`C-12 approving the ${status} concept is 404 CONCEPT_NOT_FOUND, identical to a missing concept @api @authz @approval`, async () => {
    const a = await client();
    await expectLikeMissing((c) => a.post(`/api/projects/${id}/approve`, { data: { conceptId: c } }), cid(status), 404);
    // Nothing was approved or archived. (snapshot.status is the derived display status, AWAITING_APPROVAL
    // here because concept 5 is approved, so the visible concept list is the check.)
    const list = await expectJson(await a.get(`/api/projects/${id}/concepts`));
    expect(list.concepts.map((c: { status: string }) => c.status)).toEqual(["published", "approved"]);
  });
}

test("C-12 approving the published concept is 200 and moves the project to AWAITING_APPROVAL @api @authz @approval", async () => {
  const body = await expectJson(await (await client()).post(`/api/projects/${id}/approve`, { data: { conceptId: cid("published") } }));
  expect(body.project.status).toBe("AWAITING_APPROVAL");
});

test("C-09/C-10 hidden-concept routes still answer 401 to an anonymous caller @api @authz @concepts", async () => {
  const anon = await anonymous();
  await expectError(await anon.get(assetsPath(cid("draft"))), 401, "UNAUTHORIZED");
  await expectError(await anon.get(commentsPath(cid("draft"))), 401, "UNAUTHORIZED");
});

// ---------------------------------------------------------------------------------------------
// DV-7 deviations: Next answers 200/201 for these (no visibility check: assets/route.ts:49, comments/route.ts:35,
// revision-requests/route.ts:61). Exact titles are in expected-next-failures.txt.

async function assetsHidden(status: Status) {
  const a = await client();
  await expectLikeMissing((c) => a.get(assetsPath(c)), cid(status), 404);
}
async function commentsGetHidden(status: Status) {
  const a = await client();
  await expectLikeMissing((c) => a.get(commentsPath(c)), cid(status), 404);
}
async function commentsPostHidden(status: Status) {
  const a = await client();
  await expectLikeMissing((c) => a.post(commentsPath(c), { data: { body: "Hidden?" } }), cid(status), 404);
}
async function revisionHidden(status: Status) {
  const a = await client();
  await expectLikeMissing((c) => a.post(`/api/projects/${id}/revision-requests`, { data: { body: "Hidden?", conceptId: c } }), cid(status), 400);
  expect(await revisionsLeft()).toBe(2);
}

test("DV-7/C-09 assets of an unknown concept are 404 CONCEPT_NOT_FOUND @deviation @api @authz @concepts", async () => {
  await expectError(await (await client()).get(assetsPath(UNKNOWN_ID)), 404, "CONCEPT_NOT_FOUND");
});
test("DV-7/C-09 assets of a draft concept answer like a missing concept (404 CONCEPT_NOT_FOUND) @deviation @api @authz @concepts", () => assetsHidden("draft"));
test("DV-7/C-09 assets of a deleted concept answer like a missing concept (404 CONCEPT_NOT_FOUND) @deviation @api @authz @concepts", () => assetsHidden("deleted"));
test("DV-7/C-09 assets of an archived concept answer like a missing concept (404 CONCEPT_NOT_FOUND) @deviation @api @authz @concepts", () => assetsHidden("archived"));

test("DV-7/C-10 comments GET on a draft concept answers like a missing concept (404 CONCEPT_NOT_FOUND) @deviation @api @authz @concepts", () => commentsGetHidden("draft"));
test("DV-7/C-10 comments GET on a deleted concept answers like a missing concept (404 CONCEPT_NOT_FOUND) @deviation @api @authz @concepts", () => commentsGetHidden("deleted"));
test("DV-7/C-10 comments GET on an archived concept answers like a missing concept (404 CONCEPT_NOT_FOUND) @deviation @api @authz @concepts", () => commentsGetHidden("archived"));

test("DV-7/C-10 comments POST on a draft concept answers like a missing concept (404 CONCEPT_NOT_FOUND) @deviation @api @authz @concepts", () => commentsPostHidden("draft"));
test("DV-7/C-10 comments POST on a deleted concept answers like a missing concept (404 CONCEPT_NOT_FOUND) @deviation @api @authz @concepts", () => commentsPostHidden("deleted"));
test("DV-7/C-10 comments POST on an archived concept answers like a missing concept (404 CONCEPT_NOT_FOUND) @deviation @api @authz @concepts", () => commentsPostHidden("archived"));

test("DV-7/C-11 a revision request on a draft concept answers like a missing concept (400 CONCEPT_NOT_FOUND) and reserves nothing @deviation @api @authz @revisions", () => revisionHidden("draft"));
test("DV-7/C-11 a revision request on a deleted concept answers like a missing concept (400 CONCEPT_NOT_FOUND) and reserves nothing @deviation @api @authz @revisions", () => revisionHidden("deleted"));
test("DV-7/C-11 a revision request on an archived concept answers like a missing concept (400 CONCEPT_NOT_FOUND) and reserves nothing @deviation @api @authz @revisions", () => revisionHidden("archived"));
test("DV-7/C-11 a revision request on an approved concept answers like a missing concept (400 CONCEPT_NOT_FOUND) and reserves nothing @deviation @api @authz @revisions", () => revisionHidden("approved"));
