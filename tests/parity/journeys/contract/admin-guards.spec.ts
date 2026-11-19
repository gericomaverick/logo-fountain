// D-20 / X-03 guards for every /api/admin/* endpoint (brownfield/api-admin.md, header: requireUser + requireAdmin;
// mutations are Origin-guarded first). The full role × endpoint matrix is story 0.7d.
import type { APIRequestContext } from "@playwright/test";
import { CLIENT_A, HOSTILE_ORIGIN, api, expect, expectError, test } from "./_admin-helpers";

test.describe.configure({ mode: "default" });

type Endpoint = { method: "get" | "post" | "patch" | "delete"; path: string; data?: unknown };

function endpoints(p: string, conceptId: string, revisionId: string): Endpoint[] {
  return [
    { method: "get", path: "/api/admin/projects" },
    { method: "get", path: api(p) },
    { method: "get", path: api(p, "/audit") },
    { method: "get", path: api(p, "/revision-requests") },
    { method: "get", path: api(p, "/invoices") },
    { method: "get", path: api(p, "/concepts") },
    { method: "get", path: "/api/admin/health" },
    { method: "post", path: api(p, "/status"), data: { status: "ON_HOLD", reason: "guard check" } },
    { method: "post", path: api(p, "/concepts"), data: {} },
    { method: "post", path: api(p, `/concepts/${conceptId}/publish`) },
    { method: "delete", path: api(p, `/concepts/${conceptId}`) },
    { method: "post", path: api(p, `/revision-requests/${revisionId}/delivered`), data: {} },
    { method: "post", path: api(p, "/finals"), data: {} },
    { method: "post", path: api(p, "/finals/notify"), data: {} },
    { method: "post", path: api(p, "/finals/download") },
    { method: "patch", path: api(p, "/entitlements"), data: { concepts: 5, reason: "guard check" } },
    { method: "post", path: api(p, "/entitlements/reset") },
    { method: "post", path: api(p, "/reset"), data: { confirm: true, mode: "clean-slate" } },
    { method: "post", path: "/api/admin/checkout/reprocess", data: { session_id: "cs_test_parity_p1_clientA" } },
  ];
}

async function sweep(ctx: APIRequestContext, list: Endpoint[], status: number, code: string) {
  for (const e of list) {
    const res = await ctx[e.method](e.path, e.data === undefined ? {} : { data: e.data });
    const body = await res.json().catch(() => null);
    expect.soft({ endpoint: `${e.method.toUpperCase()} ${e.path}`, status: res.status(), code: body?.error?.code }).toEqual({
      endpoint: `${e.method.toUpperCase()} ${e.path}`,
      status,
      code,
    });
  }
}

test("D-20 every admin endpoint returns 401 UNAUTHORIZED to an anonymous caller @admin @api @authz", async ({ scenario, client }) => {
  const s = await scenario("revision-reserved");
  await sweep(await client(), endpoints(s.projectId(), s.conceptId(1), s.revisionId()), 401, "UNAUTHORIZED");
});

test("D-20 every admin endpoint returns 403 FORBIDDEN to a signed-in client @admin @api @authz", async ({ scenario, client }) => {
  const s = await scenario("revision-reserved");
  await sweep(await client(CLIENT_A), endpoints(s.projectId(), s.conceptId(1), s.revisionId()), 403, "FORBIDDEN");
  // Nothing changed: the project is still where the scenario left it.
  const { snapshot } = await (await s.admin.get(api(s.projectId()))).json();
  expect(snapshot.status).toBe("REVISIONS_IN_PROGRESS");
});

test("D-20/X-01 admin mutations with a foreign Origin return 403 INVALID_ORIGIN before auth @admin @api @security", async ({ scenario, client }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  const headers = { Origin: HOSTILE_ORIGIN };
  // Representative mutation, signed in as admin: rejected and nothing changes.
  await expectError(await s.admin.post(api(p, "/status"), { data: { status: "ON_HOLD", reason: "origin check" }, headers }), 403, "INVALID_ORIGIN");
  const { snapshot } = await (await s.admin.get(api(p))).json();
  expect(snapshot.status).toBe("CONCEPTS_READY");
  // The Origin guard runs before authentication: an anonymous caller also gets 403, not 401.
  await expectError(await (await client()).post(api(p, "/reset"), { data: { confirm: true, mode: "clean-slate" }, headers }), 403, "INVALID_ORIGIN");
  // A GET is not Origin-guarded.
  expect((await s.admin.get(api(p, "/audit"), { headers })).status()).toBe(200);
});
