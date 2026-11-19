// X-01 Origin guard over every endpoint in _authz-table.ts (story 0.7d; auth-and-security.md §5).
// - Every guarded mutation (the 23 route files calling rejectUntrustedMutationOrigin, plus the 6 authMutation
//   endpoints) × each bad Origin/Referer variant -> 403 INVALID_ORIGIN, as an anonymous caller: the guard runs
//   before auth, so it is 403, never 401.
// - A canonical Referer without an Origin passes the guard (the request then gets its normal anonymous answer).
// - Signed-in callers with a foreign Origin are refused on every guarded mutation, and nothing changes.
// - Exempt endpoints (webhook, checkout magic-link/resend, GET /checkout/start, every GET, health) answer the
//   same with no Origin or a foreign Origin.
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { baseURL } from "../../adapters/api";
import { expect, test } from "../../fixtures";
import { ENDPOINTS, errorCode, label, pA, requestOptions, resolvePath, type Endpoint } from "./_authz-table";
import { ADMIN, CLIENT_A, as, expectJson, useScenario } from "./_client-helpers";

const FOREIGN = "https://evil.example";
const INVALID_ORIGIN = { error: { code: "INVALID_ORIGIN", message: "Request origin is not allowed." } };
const guarded = ENDPOINTS.filter((e) => e.guarded);
const exempt = ENDPOINTS.filter((e) => !e.guarded);

const REFUSED: Array<{ name: string; headers: Record<string, string> }> = [
  { name: "no Origin and no Referer", headers: {} },
  { name: "Origin null", headers: { Origin: "null" } },
  { name: "a foreign Origin", headers: { Origin: FOREIGN } },
  { name: "a foreign Origin and a canonical Referer", headers: { Origin: FOREIGN, Referer: `${baseURL}/dashboard` } },
  { name: "no Origin and a foreign Referer", headers: { Referer: `${FOREIGN}/dashboard` } },
  { name: "no Origin and a canonical Referer with a fragment", headers: { Referer: `${baseURL}/dashboard#x` } },
];

/** An anonymous context that sends no Origin or Referer of its own. */
async function bare(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL });
}

async function send(e: Endpoint, headers: Record<string, string>) {
  const ctx = await bare();
  try {
    const res = await ctx.fetch(resolvePath(e.path), requestOptions(e, headers));
    const text = await res.text();
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { /* not JSON (webhook text, redirects) */ }
    return { status: res.status(), body, text };
  } finally {
    await ctx.dispose();
  }
}

const anonymousCell = (e: Endpoint) => {
  const cell = e.expect.anonymous;
  if (cell === "DV-14") throw new Error("anonymous cells are never DV-14");
  return Array.isArray(cell) ? { status: cell[0], code: cell[1] as string | undefined } : { status: cell, code: undefined };
};

// No seeding: the guard answers before any I/O.
for (const e of guarded) {
  for (const variant of REFUSED) {
    test(`X-01 ${label(e)} with ${variant.name} -> 403 INVALID_ORIGIN before auth @api @security`, async () => {
      const res = await send(e, variant.headers);
      expect({ status: res.status, body: res.body }, res.text.slice(0, 300)).toEqual({ status: 403, body: INVALID_ORIGIN });
    });
  }
}

for (const e of exempt) {
  test(`X-01 exempt ${label(e)} answers the same with no Origin or a foreign Origin @api @security`, async () => {
    const want = anonymousCell(e);
    for (const headers of [{}, { Origin: FOREIGN }]) {
      const res = await send(e, headers);
      expect(res.status, `${JSON.stringify(headers)}: ${res.text.slice(0, 300)}`).toBe(want.status);
      if (want.code) expect(errorCode(res.body)).toBe(want.code);
    }
  });
}

test.describe("with a seeded database", () => {
  useScenario("two-tenants");

  for (const e of guarded) {
    test(`X-01 ${label(e)} with only a canonical Referer passes the guard (normal anonymous answer) @api @security`, async () => {
      const want = anonymousCell(e);
      const res = await send(e, { Referer: `${baseURL}/dashboard?from=matrix` });
      expect(res.status, res.text.slice(0, 300)).toBe(want.status);
      if (want.code) expect(errorCode(res.body)).toBe(want.code);
    });
  }

  test("X-01 signed-in callers with a foreign Origin get 403 INVALID_ORIGIN on every guarded mutation and nothing changes @api @security", async () => {
    const admin = await as(ADMIN);
    const client = await as(CLIENT_A);
    const state = async () => {
      const { snapshot } = await expectJson(await client.get(`/api/projects/${pA}`));
      return {
        status: snapshot.status,
        concepts: snapshot.concepts.map((c: { id: string; status: string }) => [c.id, c.status]),
        entitlements: snapshot.entitlements,
        messages: (await expectJson(await client.get(`/api/projects/${pA}/messages`))).messages.map((m: { id: string }) => m.id),
        audit: (await expectJson(await admin.get(`/api/admin/projects/${pA}/audit`))).events.length,
        profile: (await expectJson(await client.get("/api/profile"))).profile,
      };
    };
    const before = await state();
    for (const e of guarded) {
      const ctx = e.path.startsWith("/api/admin/") ? admin : client;
      const res = await ctx.fetch(resolvePath(e.path), requestOptions(e, { Origin: FOREIGN }));
      expect.soft({ endpoint: label(e), status: res.status(), body: await res.json().catch(() => null) }).toEqual({ endpoint: label(e), status: 403, body: INVALID_ORIGIN });
    }
    // Sessions survived (no logout, no password change) and no state moved.
    for (const [ctx, email] of [[client, CLIENT_A], [admin, ADMIN]] as const) {
      expect(await expectJson(await ctx.get("/api/auth/session"))).toMatchObject({ authenticated: true, email });
    }
    expect(await state()).toEqual(before);
  });
});
