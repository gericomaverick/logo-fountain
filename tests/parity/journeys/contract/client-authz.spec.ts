// Auth and membership guards on every client project endpoint (story 0.7b scope; the full generated
// matrix with concept statuses is story 0.7d). Anonymous -> 401 UNAUTHORIZED; a client of another tenant
// and an unknown project -> 404 PROJECT_NOT_FOUND (existence does not leak). Mutations carry the canonical
// Origin (adapters/api.ts), so the Origin guard passes and auth is what answers. Bodies are valid where
// Next validates the body before membership (brief, revision-requests, approve), so the guard is what answers.
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { ADMIN, CLIENT_A, CLIENT_B, UNKNOWN_ID, VALID_BRIEF, anonymous, as, conceptId, expectError, projectId, useScenario } from "./_client-helpers";

useScenario("two-tenants");

const pA = projectId("two-tenants", "pA");
const cA1 = conceptId("two-tenants", 1, "pA");

type Call = { method: "get" | "post" | "put" | "delete"; path: (project: string) => string; data?: unknown };

async function send(ctx: APIRequestContext, call: Call, project: string) {
  const url = call.path(project);
  return call.data === undefined ? ctx[call.method](url) : ctx[call.method](url, { data: call.data });
}

/** Anonymous 401, client B on A's project 404, client A on an unknown project 404. */
async function expectGuarded(call: Call, nonMemberCode = "PROJECT_NOT_FOUND") {
  const anon = await expectError(await send(await anonymous(), call, pA), 401, "UNAUTHORIZED");
  expect(anon.error.details).toEqual({ nextStep: "Sign in and retry." });
  const other = await expectError(await send(await as(CLIENT_B), call, pA), 404, nonMemberCode);
  if (nonMemberCode === "PROJECT_NOT_FOUND") expect(other.error.details).toEqual({ nextStep: "Check the project link." });
  await expectError(await send(await as(CLIENT_A), call, UNKNOWN_ID), 404, nonMemberCode);
}

/** The route deliberately excludes admins (no membership -> 404). */
async function expectAdminExcluded(call: Call) {
  await expectError(await send(await as(ADMIN), call, pA), 404, "PROJECT_NOT_FOUND");
}

/** Admin-or-member routes: an admin reads any project. */
async function expectAdminAllowed(call: Call) {
  const res = await send(await as(ADMIN), call, pA);
  expect(res.status(), await res.text()).toBe(200);
}

const snapshot: Call = { method: "get", path: (p) => `/api/projects/${p}` };
const entitlements: Call = { method: "get", path: (p) => `/api/projects/${p}/entitlements` };
const briefGet: Call = { method: "get", path: (p) => `/api/projects/${p}/brief` };
const briefPost: Call = { method: "post", path: (p) => `/api/projects/${p}/brief`, data: VALID_BRIEF };
const draftGet: Call = { method: "get", path: (p) => `/api/projects/${p}/brief/draft` };
const draftPut: Call = { method: "put", path: (p) => `/api/projects/${p}/brief/draft`, data: { answers: VALID_BRIEF } };
const draftDelete: Call = { method: "delete", path: (p) => `/api/projects/${p}/brief/draft` };
const concepts: Call = { method: "get", path: (p) => `/api/projects/${p}/concepts` };
const assets: Call = { method: "get", path: (p) => `/api/projects/${p}/concepts/${cA1}/assets` };
const commentsGet: Call = { method: "get", path: (p) => `/api/projects/${p}/concepts/${cA1}/comments` };
const commentsPost: Call = { method: "post", path: (p) => `/api/projects/${p}/concepts/${cA1}/comments`, data: { body: "hi" } };
const revision: Call = { method: "post", path: (p) => `/api/projects/${p}/revision-requests`, data: { body: "x", conceptId: cA1 } };
const approveCall: Call = { method: "post", path: (p) => `/api/projects/${p}/approve`, data: { conceptId: cA1 } };
const finalsCall: Call = { method: "post", path: (p) => `/api/projects/${p}/finals` };
const messagesGet: Call = { method: "get", path: (p) => `/api/projects/${p}/messages` };
const messagesPost: Call = { method: "post", path: (p) => `/api/projects/${p}/messages`, data: { body: "hi" } };
const readState: Call = { method: "post", path: (p) => `/api/projects/${p}/read-state`, data: { area: "messages" } };
const invoices: Call = { method: "get", path: (p) => `/api/projects/${p}/invoices` };

test("C-02 GET /api/projects/{id} guards: 401 anonymous, 404 non-member and unknown, admin allowed @api @client @authz", async () => {
  await expectGuarded(snapshot);
  await expectAdminAllowed(snapshot);
});

test("C-16 GET entitlements guards: 401 anonymous, 404 non-member, unknown and admin @api @client @entitlements @authz", async () => {
  await expectGuarded(entitlements);
  await expectAdminExcluded(entitlements);
});

test("C-07 GET brief guards: 401 anonymous, 404 non-member and unknown, admin allowed @api @client @brief @authz", async () => {
  await expectGuarded(briefGet);
  await expectAdminAllowed(briefGet);
});

test("C-07 POST brief guards: 401 anonymous, 404 non-member, unknown and admin @api @client @brief @authz", async () => {
  await expectGuarded(briefPost);
  await expectAdminExcluded(briefPost);
});

test("C-06 brief/draft GET, PUT and DELETE guards: 401 anonymous, 404 non-member, unknown and admin @api @client @brief @authz", async () => {
  for (const call of [draftGet, draftPut, draftDelete]) {
    await expectGuarded(call);
    await expectAdminExcluded(call);
  }
});

test("C-08 GET concepts guards: 401 anonymous, 404 non-member and unknown, admin allowed @api @client @concepts @authz", async () => {
  await expectGuarded(concepts);
  await expectAdminAllowed(concepts);
});

test("C-09 GET concept assets guards: 401 anonymous, 404 non-member and unknown, admin allowed @api @client @concepts @authz", async () => {
  await expectGuarded(assets);
  await expectAdminAllowed(assets);
});

test("C-10 concept comments GET and POST guards: 401 anonymous, 404 non-member and unknown @api @client @concepts @authz", async () => {
  await expectGuarded(commentsGet);
  await expectGuarded(commentsPost);
  await expectAdminAllowed(commentsGet);
});

test("C-10 a client cannot reach another tenant's concept through their own project (404 CONCEPT_NOT_FOUND) @api @client @concepts @authz", async () => {
  const b = await as(CLIENT_B);
  const pB = projectId("two-tenants", "pB");
  await expectError(await b.get(`/api/projects/${pB}/concepts/${cA1}/comments`), 404, "CONCEPT_NOT_FOUND");
  await expectError(await b.post(`/api/projects/${pB}/concepts/${cA1}/comments`, { data: { body: "hi" } }), 404, "CONCEPT_NOT_FOUND");
  await expectError(await b.post(`/api/projects/${pB}/revision-requests`, { data: { body: "x", conceptId: cA1 } }), 400, "CONCEPT_NOT_FOUND");
  await expectError(await b.post(`/api/projects/${pB}/approve`, { data: { conceptId: cA1 } }), 404, "CONCEPT_NOT_FOUND");
  // .../assets for a foreign concept answers 200 {assets:[]} on Next (no concept check, F-7); DV-7 (story 0.7d) owns it.
});

test("C-11 POST revision-requests guards: 401 anonymous, 404 non-member, unknown and admin @api @client @revisions @authz", async () => {
  await expectGuarded(revision);
  await expectAdminExcluded(revision);
});

test("C-12 POST approve guards: 401 anonymous, 404 non-member, unknown and admin @api @client @approval @authz", async () => {
  await expectGuarded(approveCall);
  await expectAdminExcluded(approveCall);
});

test("C-13 POST finals guards: 401 anonymous; non-member and unknown answer 404 FINAL_ZIP_NOT_AVAILABLE @api @client @finals @authz", async () => {
  await expectGuarded(finalsCall, "FINAL_ZIP_NOT_AVAILABLE");
});

test("C-14 messages GET and POST guards: 401 anonymous, 404 non-member and unknown, admin may read @api @client @messages @authz", async () => {
  await expectGuarded(messagesGet);
  await expectGuarded(messagesPost);
  await expectAdminAllowed(messagesGet);
});

test("C-15 POST read-state guards: 401 anonymous, 404 non-member and unknown, admin allowed @api @client @messages @concepts @authz", async () => {
  await expectGuarded(readState);
  await expectAdminAllowed(readState);
});

test("K-11/C-18 GET project invoices guards: 401 anonymous, 404 non-member, unknown and admin @api @client @invoices @authz", async () => {
  await expectGuarded(invoices);
  await expectAdminExcluded(invoices);
});
