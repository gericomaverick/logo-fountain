// Story 0.7a: mailbox-proof links (magic, reset, setup), their emails, A-11 send failure and the link-endpoint limits.
// Spec: docs/laravel-migration/brownfield/auth-and-security.md §2, §4, §8, §11.
import { expect, test } from "../../fixtures";
import { baseURL, PARITY_PASSWORD } from "../../adapters/api";
import {
  acquireDbLock, clearEmailFailures, client, failNextEmails, GENERIC_FAILURE, login, MAGIC_SENT, mailbox, proofLink, purchase,
  releaseDbLock, RESET_SENT, seed, session, setCookies, type Mail,
} from "./_auth-helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { test.setTimeout(660_000); await acquireDbLock(); });
test.afterAll(() => releaseDbLock());
test.beforeEach(async () => { await clearEmailFailures(); seed("awaiting-brief"); });

const A = "client.a@parity.test";
const NEW_PASSWORD = "Parity-Next-2026!";
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,256}$/;
const AUTH_FAILED = { error: { code: "AUTH_FAILED", message: GENERIC_FAILURE } };

async function requestMagic(email: string, next?: string) {
  const res = await (await client()).post("/api/auth/magic-link", { data: next === undefined ? { email } : { email, next } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual(MAGIC_SENT);
  return res;
}
async function magicLinkFor(email: string, next?: string, typedAs = email) {
  const box = await mailbox(email);
  await requestMagic(typedAs, next);
  const [mail] = await box.next();
  return { mail, link: proofLink(mail) };
}
async function resetLinkFor(email: string) {
  const box = await mailbox(email);
  const res = await (await client()).post("/api/auth/forgot-password", { data: { email } });
  expect(await res.json()).toEqual(RESET_SENT);
  const [mail] = await box.next();
  return { mail, link: proofLink(mail) };
}
const verify = async (token: string, ctx?: Awaited<ReturnType<typeof client>>) => (ctx ?? (await client())).post("/api/auth/magic-link/verify", { data: { token } });
const reset = async (token: string, newPassword = NEW_PASSWORD) => (await client()).post("/api/auth/reset-password", { data: { token, newPassword } });

function expectLink(mail: Mail, link: ReturnType<typeof proofLink>, subject: string, path: string, next: string | RegExp) {
  expect(mail.subject).toBe(subject);
  expect(link.origin).toBe(baseURL);
  expect(link.path).toBe(path);
  expect(link.query).toBe(""); // token only in the fragment, never the query
  expect(link.token).toMatch(TOKEN_SHAPE);
  if (typeof next === "string") expect(link.next).toBe(next); else expect(link.next).toMatch(next);
}

test("A-05/N-03 magic-link request: uniform message, one sign-in email with a fragment link @api @auth @email", async () => {
  const box = await mailbox(A);
  for (const email of ["nobody@parity.test", "not-an-email", ""]) await requestMagic(email);
  expect(await box.countAfterSettle()).toBe(0);
  const { mail, link } = await magicLinkFor(A, undefined, "  Client.A@Parity.TEST ");
  expectLink(mail, link, "Your Logo Fountain sign-in link", "/auth/callback", "/dashboard");
  expect(mail.html).toContain("Sign in to Logo Fountain");
});

test("A-05/A-13 magic-link next: safe paths keep query, unsafe ones fall back to /dashboard @api @auth @email", async () => {
  expect((await magicLinkFor(A, "/project/abc?tab=brief")).link.next).toBe("/project/abc?tab=brief");
  expect((await magicLinkFor(A, "//evil.example/x")).link.next).toBe("/dashboard");
  expect((await magicLinkFor(A, "https://evil.example/")).link.next).toBe("/dashboard");
});

test("A-05 magic-link verify: a valid token signs in once; reuse, bad shape and unknown tokens fail @api @auth", async () => {
  const { link } = await magicLinkFor(A);
  const ctx = await client();
  const res = await verify(link.token, ctx);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers()["cache-control"]).toBe("no-store");
  expect(setCookies(res).length).toBeGreaterThan(0);
  expect(await session(ctx)).toMatchObject({ authenticated: true, email: A });
  for (const token of [link.token, "short", "x".repeat(257), "not a valid token!!!!!", "A".repeat(43), ""]) {
    const again = await verify(token);
    expect(again.status(), token.slice(0, 30)).toBe(400);
    expect(await again.json()).toEqual(AUTH_FAILED);
  }
});

test("A-05/A-08 proof kinds do not cross: a reset token cannot sign in, a magic token cannot reset @api @auth @security", async () => {
  const { link: resetLink } = await resetLinkFor(A);
  const { link: magic } = await magicLinkFor(A);
  const r1 = await verify(resetLink.token);
  expect(r1.status()).toBe(400);
  expect(await r1.json()).toEqual(AUTH_FAILED);
  const r2 = await reset(magic.token);
  expect(r2.status()).toBe(400);
  expect(await r2.json()).toEqual(AUTH_FAILED);
  // Both are still alive for their own purpose.
  expect((await verify(magic.token)).status()).toBe(200);
  expect((await reset(resetLink.token)).status()).toBe(200);
});

test("A-07/N-01 forgot-password: INVALID_EMAIL without @, otherwise a uniform message and one reset email @api @auth @email", async () => {
  const ctx = await client();
  for (const email of ["", "not-an-email", "   "]) {
    const res = await ctx.post("/api/auth/forgot-password", { data: { email } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "INVALID_EMAIL", message: "Enter a valid email address." } });
  }
  const unknown = await ctx.post("/api/auth/forgot-password", { data: { email: "nobody@parity.test" } });
  expect(unknown.status()).toBe(200);
  expect(await unknown.json()).toEqual(RESET_SENT);
  const { mail, link } = await resetLinkFor(A);
  expectLink(mail, link, "Reset your Logo Fountain password", "/reset-password", "/dashboard");
  expect(mail.html).toContain("Reset password");
});

test("A-08 reset-password: WEAK_PASSWORD for <8 characters or >72 bytes @api @auth", async () => {
  const { link } = await resetLinkFor(A);
  for (const pw of ["short", "1234567", "é".repeat(37)]) {
    const res = await reset(link.token, pw);
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "WEAK_PASSWORD", message: GENERIC_FAILURE } });
  }
  expect((await reset(link.token)).status()).toBe(200);
});

test("A-08/A-10 reset-password revokes every session and every outstanding link, and creates no session @api @auth @security", async () => {
  const signedIn = await client();
  await login(signedIn, A, PARITY_PASSWORD);
  const { link: magic } = await magicLinkFor(A);
  const { link: olderReset } = await resetLinkFor(A);
  const { link: used } = await resetLinkFor(A);
  const res = await reset(used.token);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers()["cache-control"]).toBe("no-store");
  expect(setCookies(res)).toEqual([]);
  expect(await session(signedIn)).toEqual({ authenticated: false });
  for (const [label, attempt] of [["reuse", () => reset(used.token, "Another-Pass-2026!")], ["older reset", () => reset(olderReset.token, "Another-Pass-2026!")], ["magic", () => verify(magic.token)]] as const) {
    const r = await attempt();
    expect(r.status(), label).toBe(400);
    expect(await r.json()).toEqual(AUTH_FAILED);
  }
  expect((await login(await client(), A, PARITY_PASSWORD)).status()).toBe(400);
  expect((await login(await client(), A, NEW_PASSWORD)).status()).toBe(200);
});

test("A-11 a failed auth email send gives the uniform answer, sends nothing, and a retry delivers a working link @api @auth @email", async () => {
  for (const [path, body] of [["/api/auth/magic-link", { email: A }], ["/api/auth/forgot-password", { email: A }]] as const) {
    const box = await mailbox(A);
    await failNextEmails(1);
    const res = await (await client()).post(path, { data: body });
    expect(res.status(), path).toBe(200);
    expect(await res.json()).toEqual(path.endsWith("magic-link") ? MAGIC_SENT : RESET_SENT);
    expect(await res.text()).not.toMatch(/token|https?:/);
    expect(await box.countAfterSettle(), path).toBe(0);
  }
  const { link } = await magicLinkFor(A);
  expect((await verify(link.token)).status()).toBe(200);
});

test("A-06/N-02 setup: a fresh purchaser with no password gets a setup link that sets the first password @api @auth @checkout @email", async () => {
  seed("fresh-purchase");
  expect((await login(await client(), A, NEW_PASSWORD)).status()).toBe(400);
  const box = await mailbox(A);
  await purchase(A);
  const mails = await box.next();
  expect(mails).toHaveLength(1);
  const link = proofLink(mails[0]);
  expectLink(mails[0], link, "Finish setting up your Logo Fountain account", "/set-password", /^\/project\/[0-9a-f-]{36}$/);
  expect(mails[0].html).toContain("Finish account setup");
  // A setup proof is not a sign-in proof.
  expect((await verify(link.token)).status()).toBe(400);
  const res = await reset(link.token);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(setCookies(res)).toEqual([]);
  expect((await reset(link.token, "Another-Pass-2026!")).status()).toBe(400);
  const ctx = await client();
  expect((await login(ctx, A, NEW_PASSWORD)).status()).toBe(200);
  expect(await session(ctx)).toMatchObject({ authenticated: true, email: A });
});

test("A-06 setup degrades to a sign-in link when the purchaser already has a password @api @auth @checkout @email", async () => {
  const box = await mailbox(A);
  await purchase(A);
  const mails = await box.next();
  expect(await box.countAfterSettle(500)).toBe(1);
  const link = proofLink(mails[0]);
  expectLink(mails[0], link, "Your Logo Fountain sign-in link", "/auth/callback", /^\/project\/[0-9a-f-]{36}$/);
  expect((await reset(link.token)).status()).toBe(400);
  expect((await login(await client(), A, PARITY_PASSWORD)).status()).toBe(200);
  expect((await verify(link.token)).status()).toBe(200);
});

test("X-06 link requests: the identity bucket allows 5 per 15 min, the 6th still answers uniformly but sends nothing @api @auth @security @email", async () => {
  for (const [path, expected] of [["/api/auth/magic-link", MAGIC_SENT], ["/api/auth/forgot-password", RESET_SENT]] as const) {
    const box = await mailbox(A);
    const ctx = await client();
    for (let i = 0; i < 6; i++) {
      const res = await ctx.post(path, { data: { email: i % 2 ? A.toUpperCase() : A } });
      expect(res.status(), `${path} #${i + 1}`).toBe(200);
      expect(await res.json()).toEqual(expected);
    }
    await box.next(5);
    expect(await box.countAfterSettle(), path).toBe(5);
  }
});

test("X-06 token endpoints: 5 attempts per token per 15 min, then 429 RATE_LIMITED @api @auth @security", async () => {
  const token = "Z".repeat(43);
  for (const path of ["/api/auth/magic-link/verify", "/api/auth/reset-password"]) {
    const ctx = await client();
    for (let i = 0; i < 5; i++) {
      const res = await ctx.post(path, { data: { token, newPassword: NEW_PASSWORD } });
      expect(res.status(), `${path} #${i + 1}`).toBe(400);
    }
    const res = await ctx.post(path, { data: { token, newPassword: NEW_PASSWORD } });
    expect(res.status(), path).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "RATE_LIMITED" } });
    expect(res.headers()["cache-control"]).toBe("no-store");
  }
});
