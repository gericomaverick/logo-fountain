// Story 0.7d: the single L6 endpoint table. Every route file under apps/web/src/app/api/**/route.ts
// (48 files) plus /checkout/start = 49 files, 57 method endpoints. Shared by authz-matrix.spec.ts and
// origin-guard.spec.ts. Expected values are CURRENT Next behaviour (brownfield docs + corrections;
// where they disagree, Next wins and the story record says so). Scenario: two-tenants
// (clientA owns pA, clientB owns pB, both CONCEPTS_READY with published concepts 1 and 2).
import { PARITY_PASSWORD } from "../../adapters/api";
import { VALID_BRIEF, UNKNOWN_ID, conceptId, projectId } from "./_client-helpers";

export type Actor = "anonymous" | "clientA" | "clientB" | "admin";
export const ACTORS: Actor[] = ["anonymous", "clientA", "clientB", "admin"];
export const ACTOR_EMAIL: Record<Exclude<Actor, "anonymous">, string> = {
  clientA: "client.a@parity.test",
  clientB: "client.b@parity.test",
  admin: "admin@parity.test",
};

/** A status, or [status, error code]. "DV-14": cell covered by a @deviation test instead (Next answers 500). */
export type Cell = number | [number, string] | "DV-14";

export type Endpoint = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Display path; {id} = pA, {conceptId} = pA concept 1, {rid} = an unknown revision request. */
  path: string;
  data?: unknown;
  multipart?: Record<string, string>;
  /** Mutation behind the Origin guard (auth-and-security.md §5; authMutation counts). */
  guarded: boolean;
  expect: Record<Actor, Cell>;
};

export const pA = projectId("two-tenants", "pA");
export const cA1 = conceptId("two-tenants", 1, "pA");

export function resolvePath(path: string): string {
  return path.replaceAll("{id}", pA).replaceAll("{conceptId}", cA1).replaceAll("{rid}", UNKNOWN_ID);
}

const U: Cell = [401, "UNAUTHORIZED"];
const F: Cell = [403, "FORBIDDEN"];
const P: Cell = [404, "PROJECT_NOT_FOUND"];
const all = (cell: Cell): Record<Actor, Cell> => ({ anonymous: cell, clientA: cell, clientB: cell, admin: cell });
const user = (ok: Cell): Record<Actor, Cell> => ({ anonymous: U, clientA: ok, clientB: ok, admin: ok });
/** Member-only project route: admins are deliberately excluded (no membership -> 404). */
const member = (ok: Cell): Record<Actor, Cell> => ({ anonymous: U, clientA: ok, clientB: P, admin: P });
/** Admin-or-member project route. */
const memberOrAdmin = (ok: Cell, admin: Cell = ok): Record<Actor, Cell> => ({ anonymous: U, clientA: ok, clientB: P, admin });
const adminOnly = (ok: Cell): Record<Actor, Cell> => ({ anonymous: U, clientA: F, clientB: F, admin: ok });

const NEW_PASSWORD = "Parity-Matrix-2026!";
const TOKEN = "parityMatrixToken0000000000000000";
const UNKNOWN_SESSION = "cs_test_parity_matrix_unknown";

export const ENDPOINTS: Endpoint[] = [
  // ---- Auth (A-*). authMutation = Origin guard + JSON; public except password change.
  { method: "GET", path: "/api/auth/session", guarded: false, expect: all(200) },
  { method: "POST", path: "/api/auth/login", data: { email: ACTOR_EMAIL.clientA, password: PARITY_PASSWORD }, guarded: true, expect: all(200) },
  { method: "POST", path: "/api/auth/logout", guarded: true, expect: all(200) },
  { method: "POST", path: "/api/auth/magic-link", data: { email: "nobody@parity.test", next: "/dashboard" }, guarded: true, expect: all(200) },
  { method: "POST", path: "/api/auth/magic-link/verify", data: { token: TOKEN }, guarded: true, expect: all([400, "AUTH_FAILED"]) },
  { method: "POST", path: "/api/auth/forgot-password", data: { email: "nobody@parity.test" }, guarded: true, expect: all(200) },
  { method: "POST", path: "/api/auth/reset-password", data: { token: TOKEN, newPassword: NEW_PASSWORD }, guarded: true, expect: all([400, "AUTH_FAILED"]) },
  { method: "POST", path: "/api/auth/password", data: { currentPassword: PARITY_PASSWORD, newPassword: NEW_PASSWORD }, guarded: true, expect: user(200) },

  // ---- Public / possession (K-*, O-*): no session needed, no Origin guard.
  { method: "GET", path: "/checkout/start?package_code=essential", guarded: false, expect: all(303) },
  { method: "GET", path: "/api/checkout/status?session_id=cs_test_parity_pA_clientA", guarded: false, expect: all(200) },
  { method: "POST", path: "/api/checkout/magic-link", data: { session_id: UNKNOWN_SESSION }, guarded: false, expect: all([409, "NOT_FULFILLED"]) },
  { method: "POST", path: "/api/checkout/resend-magic-link", data: { session_id: UNKNOWN_SESSION }, guarded: false, expect: all([409, "NOT_FULFILLED"]) },
  { method: "POST", path: "/api/stripe/webhook", data: { id: "evt_unsigned" }, guarded: false, expect: all(400) },
  { method: "GET", path: "/api/health", guarded: false, expect: all(200) },

  // ---- Signed-in user, not project-scoped.
  { method: "GET", path: "/api/projects", guarded: false, expect: user(200) },
  { method: "GET", path: "/api/invoices", guarded: false, expect: user(200) },
  { method: "GET", path: "/api/profile", guarded: false, expect: user(200) },
  { method: "PUT", path: "/api/profile", data: { firstName: "Matrix" }, guarded: true, expect: user(200) },

  // ---- Client project routes (C-*), all on client A's project pA.
  { method: "GET", path: "/api/projects/{id}", guarded: false, expect: memberOrAdmin(200) },
  { method: "GET", path: "/api/projects/{id}/entitlements", guarded: false, expect: member(200) },
  { method: "GET", path: "/api/projects/{id}/brief", guarded: false, expect: memberOrAdmin(200) },
  { method: "POST", path: "/api/projects/{id}/brief", data: VALID_BRIEF, guarded: true, expect: member([400, "BRIEF_LOCKED"]) },
  { method: "GET", path: "/api/projects/{id}/brief/draft", guarded: false, expect: member(200) },
  { method: "PUT", path: "/api/projects/{id}/brief/draft", data: { answers: VALID_BRIEF }, guarded: true, expect: member([400, "BRIEF_LOCKED"]) },
  { method: "DELETE", path: "/api/projects/{id}/brief/draft", guarded: true, expect: member(200) },
  { method: "GET", path: "/api/projects/{id}/concepts", guarded: false, expect: memberOrAdmin(200) },
  { method: "GET", path: "/api/projects/{id}/concepts/{conceptId}/assets", guarded: false, expect: memberOrAdmin(200) },
  { method: "GET", path: "/api/projects/{id}/concepts/{conceptId}/comments", guarded: false, expect: memberOrAdmin(200) },
  { method: "POST", path: "/api/projects/{id}/concepts/{conceptId}/comments", data: { body: "Matrix comment" }, guarded: true, expect: memberOrAdmin(201, "DV-14") },
  { method: "POST", path: "/api/projects/{id}/revision-requests", data: { body: "Matrix revision", conceptId: cA1 }, guarded: true, expect: member(201) },
  { method: "POST", path: "/api/projects/{id}/approve", data: { conceptId: cA1 }, guarded: true, expect: member(200) },
  // Membership is inside the eligibility query: everyone signed in gets FINAL_ZIP_NOT_AVAILABLE (api-client.md correction 3).
  { method: "POST", path: "/api/projects/{id}/finals", guarded: true, expect: { anonymous: U, clientA: [404, "FINAL_ZIP_NOT_AVAILABLE"], clientB: [404, "FINAL_ZIP_NOT_AVAILABLE"], admin: [404, "FINAL_ZIP_NOT_AVAILABLE"] } },
  { method: "GET", path: "/api/projects/{id}/messages", guarded: false, expect: memberOrAdmin(200) },
  { method: "POST", path: "/api/projects/{id}/messages", data: { body: "Matrix message" }, guarded: true, expect: memberOrAdmin(201, "DV-14") },
  { method: "POST", path: "/api/projects/{id}/read-state", data: { area: "messages" }, guarded: true, expect: memberOrAdmin(200) },
  { method: "GET", path: "/api/projects/{id}/invoices", guarded: false, expect: member(200) },
  { method: "POST", path: "/api/projects/{id}/checkout/session", data: { kind: "addon", addonKey: "extra_revision" }, guarded: true, expect: member(200) },

  // ---- Admin routes (D-*): 401 anonymous, 403 FORBIDDEN for any client; the admin cell is the domain answer.
  { method: "GET", path: "/api/admin/projects", guarded: false, expect: adminOnly(200) },
  { method: "GET", path: "/api/admin/projects/{id}", guarded: false, expect: adminOnly(200) },
  { method: "GET", path: "/api/admin/projects/{id}/audit", guarded: false, expect: adminOnly(200) },
  { method: "GET", path: "/api/admin/projects/{id}/revision-requests", guarded: false, expect: adminOnly(200) },
  { method: "GET", path: "/api/admin/projects/{id}/invoices", guarded: false, expect: adminOnly(200) },
  { method: "GET", path: "/api/admin/projects/{id}/concepts", guarded: false, expect: adminOnly(200) },
  { method: "GET", path: "/api/admin/health", guarded: false, expect: adminOnly(200) },
  { method: "POST", path: "/api/admin/projects/{id}/status", data: { status: "ON_HOLD", reason: "matrix" }, guarded: true, expect: adminOnly(200) },
  { method: "POST", path: "/api/admin/projects/{id}/concepts", multipart: { uploadMode: "concept" }, guarded: true, expect: adminOnly([400, "FILE_REQUIRED"]) },
  { method: "POST", path: "/api/admin/projects/{id}/concepts/{conceptId}/publish", guarded: true, expect: adminOnly(200) },
  { method: "DELETE", path: "/api/admin/projects/{id}/concepts/{conceptId}", guarded: true, expect: adminOnly(200) },
  { method: "POST", path: "/api/admin/projects/{id}/revision-requests/{rid}/delivered", data: {}, guarded: true, expect: adminOnly([404, "REVISION_REQUEST_NOT_FOUND"]) },
  // F-11: the finals upload's error is a string with a top-level code.
  { method: "POST", path: "/api/admin/projects/{id}/finals", multipart: { note: "no file" }, guarded: true, expect: adminOnly([400, "FILE_REQUIRED"]) },
  { method: "POST", path: "/api/admin/projects/{id}/finals/notify", data: {}, guarded: true, expect: adminOnly([400, "FINAL_NOTIFICATION_VERSION_REQUIRED"]) },
  { method: "POST", path: "/api/admin/projects/{id}/finals/download", guarded: true, expect: adminOnly([404, "FINAL_ZIP_NOT_AVAILABLE"]) },
  { method: "PATCH", path: "/api/admin/projects/{id}/entitlements", data: { concepts: 5, reason: "matrix" }, guarded: true, expect: adminOnly(200) },
  { method: "POST", path: "/api/admin/projects/{id}/entitlements/reset", guarded: true, expect: adminOnly([409, "ENTITLEMENT_USAGE_RESET_DISABLED"]) },
  { method: "POST", path: "/api/admin/projects/{id}/reset", data: { confirm: true, mode: "clean-slate" }, guarded: true, expect: adminOnly(200) },
  // No session_id -> 400 {error:{message}} with no code (reprocess/route.ts:24). A session unknown to Stripe is an
  // uncaught StripeInvalidRequestError -> 500 (route.ts:27,63), so the matrix doesn't use one.
  { method: "POST", path: "/api/admin/checkout/reprocess", data: {}, guarded: true, expect: adminOnly(400) },
];

export function label(e: Endpoint): string {
  return `${e.method} ${e.path}`;
}

/** Playwright fetch options for an endpoint; `headers` override the context's extra headers. */
export function requestOptions(e: Endpoint, headers?: Record<string, string>) {
  return {
    method: e.method,
    maxRedirects: 0,
    ...(e.multipart ? { multipart: e.multipart } : e.data !== undefined ? { data: e.data } : {}),
    ...(headers ? { headers } : {}),
  };
}

/** error.code, or the top-level code of the F-11 finals-upload shape. */
export function errorCode(body: unknown): string | undefined {
  const b = body as { error?: { code?: string } | string; code?: string } | null;
  if (b && typeof b.error === "object" && b.error) return b.error.code;
  return b?.code;
}
