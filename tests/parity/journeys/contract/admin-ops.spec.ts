// Health (D-18) and checkout reprocess (K-12) (brownfield/api-admin.md "Health"; checkout-and-payments.md §7).
import { expect, expectOk, test } from "./_admin-helpers";

test.describe.configure({ mode: "default" });

test("D-18 admin health returns a summary of named checks; failing checks are expected locally @admin @api @ops", async ({ scenario }) => {
  const s = await scenario("admin-only");
  const res = await s.admin.get("/api/admin/health");
  const text = await res.text();
  expect(res.status()).toBe(200);
  const body = JSON.parse(text);
  expect(Object.keys(body).sort()).toEqual(["checks", "generatedAt", "ok", "summary"]);
  expect(Number.isNaN(Date.parse(body.generatedAt))).toBe(false);
  for (const check of body.checks) {
    expect(check).toMatchObject({ key: expect.any(String), label: expect.any(String), passed: expect.any(Boolean), summary: expect.any(String), nextStep: expect.any(String) });
  }
  const failed = body.checks.filter((c: any) => !c.passed).length;
  expect(body.summary).toEqual({ total: body.checks.length, passed: body.checks.length - failed, failed });
  expect(body.ok).toBe(failed === 0);
  const keys = body.checks.map((c: any) => c.key);
  for (const key of [
    "env:R2_ACCOUNT_ID", "env:R2_ACCESS_KEY_ID", "env:R2_SECRET_ACCESS_KEY", "env:R2_CONCEPTS_BUCKET", "env:R2_FINAL_DELIVERABLES_BUCKET",
    "env:STRIPE_SECRET_KEY", "env:STRIPE_WEBHOOK_SECRET", "env:POSTMARK_SERVER_TOKEN", "env:POSTMARK_FROM", "env:PUBLIC_SITE_URL",
    "env:ADMIN_NOTIFICATION_EMAILS", "stripe_allowlist", "db:connectivity", "stripe:connectivity", "r2:bucket:concepts", "r2:bucket:final-deliverables",
  ]) expect(keys).toContain(key);
  expect(body.checks.find((c: any) => c.key === "db:connectivity").passed).toBe(true);
  // No secret values are echoed.
  for (const secret of [process.env.R2_SECRET_ACCESS_KEY, process.env.R2_ACCESS_KEY_ID]) if (secret) expect(text).not.toContain(secret);
});

test("D-18 public health returns {ok:true} without checks @admin @api @ops", async ({ client }) => {
  const anon = await client();
  expect(await expectOk(await anon.get("/api/health"))).toEqual({ ok: true });
});

test("K-12 reprocess without session_id is 400 'Missing session_id' with no code @admin @api @ops", async ({ scenario }) => {
  const s = await scenario("admin-only");
  for (const data of [{}, { session_id: "   " }, { session_id: 42 }]) {
    const res = await s.admin.post("/api/admin/checkout/reprocess", { data });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: { message: "Missing session_id" } });
  }
});

test.fixme("K-12 reprocess fulfils a paid session, is deduped on repeat and is 409 CHECKOUT_SESSION_NOT_PAID for unpaid @admin @api @ops", async () => {
  // Needs the stripe-fake session fixtures (story 0.5) behind STRIPE_API_BASE; the success body is
  // {ok, deduped, projectId, orderId, clientId, purchaserEmail, orderStatus, provisionedUserId, message}.
});
