// Story 0.7a: GET /checkout/start, GET /api/checkout/status, POST /api/checkout/magic-link and resend-magic-link.
// Spec: brownfield/checkout-and-payments.md §2, §6 and auth-and-security.md §10. Webhook cases live in story 0.5 (webhook-*.spec.ts).
// Purchases go through the app and stripe-fake, so every email test gets a fresh session ID and buyer: on Next the
// checkout-email limiter is process-local and survives reseeding.
import { expect, test } from "../../fixtures";
import { baseURL } from "../../adapters/api";
import {
  acquireDbLock, clearEmailFailures, client, failNextEmails, mailbox, proofLink, purchase, releaseDbLock, seed, session, STRIPE_FAKE_URL,
  stripeSession, uniqueEmail,
} from "./_auth-helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { test.setTimeout(660_000); await acquireDbLock(); });
test.afterAll(() => releaseDbLock());
test.beforeEach(async () => { await clearEmailFailures(); seed("fresh-purchase"); });

const INVALID_PACKAGE = { error: { message: "Invalid package_code. Expected one of: essential, professional, complete", code: "INVALID_PACKAGE" } };
const PROJECT_NEXT = /^\/project\/[0-9a-f-]{36}$/;

async function start(query: string) {
  // Public link from the marketing site: no Origin guard, so a foreign Origin is fine.
  const ctx = await client({ origin: null, headers: { Origin: "https://marketing.example" } });
  return ctx.get(`/checkout/start${query}`, { maxRedirects: 0 });
}
const sessionIdFrom = (location: string) => location.match(/\/pay\/([^/?#]+)/)?.[1] ?? "";
const send = async (path: "magic-link" | "resend-magic-link", data: unknown, raw = false) =>
  (await client({ origin: null, headers: { Origin: "https://evil.example" } })).post(`/api/checkout/${path}`, raw ? { data: Buffer.from(data as string), headers: { "content-type": "application/json" } } : { data });

test("K-01 checkout start rejects anything but the three package codes with 400 INVALID_PACKAGE @api @checkout", async () => {
  for (const q of ["", "?package_code=", "?package_code=Essential", "?package_code=price_1ToTEhFM0K9Qd7oXM0WRTWjd", "?package_code=extra_revision", "?price=price_1ToTEhFM0K9Qd7oXM0WRTWjd"]) {
    const res = await start(q);
    expect(res.status(), q).toBe(400);
    expect(await res.json()).toEqual(INVALID_PACKAGE);
  }
});

test("K-01 checkout start redirects 303 to the hosted Stripe page with an allowlisted session @api @checkout", async () => {
  for (const code of ["essential", "professional", "complete"]) {
    const res = await start(`?package_code=${code}`);
    expect(res.status(), code).toBe(303);
    const location = res.headers()["location"];
    expect(location.startsWith(`${STRIPE_FAKE_URL}/pay/`), location).toBe(true);
    const s = await stripeSession(sessionIdFrom(location));
    expect(s.metadata.package_code).toBe(code);
    expect(s.metadata.campaign_slug).toBeUndefined();
    expect(s.success_url).toBe(`${baseURL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`);
    expect(s.payment_status).toBe("unpaid");
  }
});

test("K-01 campaign_slug is trimmed and truncated to 80 characters in Stripe metadata only @api @checkout", async () => {
  const slug = "spring-" + "x".repeat(100);
  const res = await start(`?package_code=essential&campaign_slug=${encodeURIComponent(`  ${slug}  `)}`);
  expect(res.status()).toBe(303);
  expect((await stripeSession(sessionIdFrom(res.headers()["location"]))).metadata.campaign_slug).toBe(slug.slice(0, 80));
  const blank = await start("?package_code=essential&campaign_slug=%20%20");
  expect((await stripeSession(sessionIdFrom(blank.headers()["location"]))).metadata.campaign_slug).toBeUndefined();
});

test("K-02 checkout status: MISSING_SESSION_ID, unknown reads PENDING, a fulfilled order reads FULFILLED and nothing else @api @checkout", async () => {
  const ctx = await client({ origin: null });
  for (const q of ["", "?session_id=", "?session_id=%20"]) {
    const res = await ctx.get(`/api/checkout/status${q}`);
    expect(res.status(), q).toBe(400);
    expect(await res.json()).toEqual({ error: { message: "Missing session_id", code: "MISSING_SESSION_ID", details: { nextStep: "Include session_id query param." } } });
  }
  const unknown = await ctx.get("/api/checkout/status?session_id=cs_test_unknown_session");
  expect(unknown.status()).toBe(200);
  expect(await unknown.json()).toEqual({ fulfilled: false, status: "PENDING" });
  const seeded = await ctx.get("/api/checkout/status?session_id=cs_test_parity_p1_clientA");
  expect(await seeded.json()).toEqual({ fulfilled: true, status: "FULFILLED" });
});

test("K-03 checkout magic-link: INVALID_JSON, MISSING_SESSION_ID and 409 NOT_FULFILLED, with no Origin guard @api @checkout @security", async () => {
  for (const path of ["magic-link", "resend-magic-link"] as const) {
    const bad = await send(path, "{not json", true);
    expect(bad.status(), path).toBe(400);
    expect(await bad.json()).toEqual({ error: { message: "Invalid JSON body", code: "INVALID_JSON" } });
    for (const body of [{}, { session_id: "" }, { session_id: "   " }, { session_id: 42 }]) {
      const res = await send(path, body);
      expect(res.status(), JSON.stringify(body)).toBe(400);
      expect(await res.json()).toEqual({ error: { message: "Missing session_id", code: "MISSING_SESSION_ID" } });
    }
    const unknown = await send(path, { session_id: "cs_test_unknown_session" });
    expect(unknown.status()).toBe(409);
    expect(await unknown.json()).toEqual({ error: { message: "Checkout session is not fulfilled yet.", code: "NOT_FULFILLED" } });
  }
});

test("K-03/A-05 checkout magic-link emails a sign-in link (never setup) even to a buyer with no password @api @checkout @security @email", async () => {
  const buyer = uniqueEmail("k03");
  const sessionId = await purchase(buyer);
  const box = await mailbox(buyer); // after the purchase's own setup email
  const res = await send("magic-link", { session_id: sessionId });
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(JSON.parse(body)).toEqual({ ok: true, delivery: "email" });
  expect(body).not.toMatch(/token|https?:/);
  const [mail] = await box.next();
  const link = proofLink(mail);
  expect(mail.subject).toBe("Your Logo Fountain sign-in link");
  expect(link.origin).toBe(baseURL);
  expect(link.path).toBe("/auth/callback");
  expect(link.next).toMatch(PROJECT_NEXT);
  const ctx = await client();
  const verified = await ctx.post("/api/auth/magic-link/verify", { data: { token: link.token } });
  expect(verified.status()).toBe(200);
  expect(await session(ctx)).toMatchObject({ authenticated: true, email: buyer });
  // A session ID is no authority over the password: the token cannot reset one.
  const reset = await (await client()).post("/api/auth/reset-password", { data: { token: link.token, newPassword: "Parity-Next-2026!" } });
  expect(reset.status()).toBe(400);
});

test("K-04/X-06 checkout sign-in emails: 3 per session, then 429 RATE_LIMITED with retry-after @api @checkout @security @email", async () => {
  const buyer = uniqueEmail("k04");
  const sessionId = await purchase(buyer);
  const box = await mailbox(buyer);
  for (const path of ["magic-link", "resend-magic-link", "resend-magic-link"] as const) {
    const res = await send(path, { session_id: ` ${sessionId} ` });
    expect(res.status(), path).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivery: "email" });
  }
  for (const path of ["resend-magic-link", "magic-link"] as const) {
    const res = await send(path, { session_id: sessionId });
    expect(res.status(), path).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "RATE_LIMITED", message: "Please wait before requesting another sign-in email." } });
    const retryAfter = Number(res.headers()["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  }
  await box.next(3);
  expect(await box.countAfterSettle()).toBe(3);
});

test("A-11/K-04 a failed checkout email send is 500 AUTH_EMAIL_SEND_FAILED with no link, and a resend works @api @checkout @email", async () => {
  const buyer = uniqueEmail("a11");
  const sessionId = await purchase(buyer);
  const box = await mailbox(buyer);
  await failNextEmails(1);
  const res = await send("magic-link", { session_id: sessionId });
  expect(res.status()).toBe(500);
  const body = await res.text();
  expect(JSON.parse(body)).toEqual({ error: { message: "Unable to send sign-in email.", code: "AUTH_EMAIL_SEND_FAILED" } });
  expect(body).not.toMatch(/token|https?:|postmark/i);
  expect(await box.countAfterSettle()).toBe(0);
  const again = await send("resend-magic-link", { session_id: sessionId });
  expect(again.status()).toBe(200);
  const [mail] = await box.next();
  const verified = await (await client()).post("/api/auth/magic-link/verify", { data: { token: proofLink(mail).token } });
  expect(verified.status()).toBe(200);
});
