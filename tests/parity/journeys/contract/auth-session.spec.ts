// Story 0.7a: login, logout, session, password change, the auth JSON wrapper and the mutation Origin guard.
// Spec: docs/laravel-migration/brownfield/auth-and-security.md §4, §5, §8, §9.
import { expect, test } from "../../fixtures";
import { baseURL as base, PARITY_PASSWORD } from "../../adapters/api";
import { scenarioId } from "../../adapters/seed";
import {
  acquireDbLock, authHeaders, client, GENERIC_FAILURE, INVALID_CREDENTIALS, INVALID_ORIGIN, login, releaseDbLock, seed, session, setCookies,
} from "./_auth-helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { test.setTimeout(660_000); await acquireDbLock(); });
test.afterAll(() => releaseDbLock());
test.beforeEach(() => { seed("awaiting-brief"); });

const A = "client.a@parity.test";
const NEW_PASSWORD = "Parity-Next-2026!";

test("A-03 session reports anonymous as authenticated:false, uncached @api @auth", async () => {
  const anon = await client();
  const res = await anon.get("/api/auth/session");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ authenticated: false });
  expect(authHeaders(res).cacheControl).toBe("no-store");
});

test("A-01/A-03 login sets a session cookie and session returns the user shape @api @auth", async () => {
  const ctx = await client();
  const res = await login(ctx, "  Client.A@Parity.test ", PARITY_PASSWORD);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(setCookies(res).length).toBeGreaterThan(0);
  const s = await ctx.get("/api/auth/session");
  expect(s.headers()["cache-control"]).toBe("no-store");
  expect(await s.json()).toEqual({ authenticated: true, userId: scenarioId("awaiting-brief", "user", "clientA"), email: A, isAdmin: false });
  const admin = await client();
  await login(admin, "admin@parity.test", PARITY_PASSWORD);
  expect(await session(admin)).toMatchObject({ authenticated: true, isAdmin: true });
});

test("A-01 wrong password, unknown account, no-password account and >72-byte password get the identical 400 @api @auth @security", async () => {
  const ctx = await client();
  const cases: Array<[string, string]> = [
    [A, "Wrong-Pass-2026!"],
    ["nobody@parity.test", PARITY_PASSWORD],
    [A, "é".repeat(37)], // 37 characters, 74 bytes
    [A, ""],
    ["", PARITY_PASSWORD],
  ];
  for (const [email, password] of cases) {
    const res = await login(ctx, email, password);
    expect(res.status(), `${email}/${password.length}`).toBe(400);
    expect(await res.json()).toEqual(INVALID_CREDENTIALS);
    expect(setCookies(res).filter((c) => !/max-age=0|expires=thu, 01 jan 1970/i.test(c))).toEqual([]);
  }
  expect(await session(ctx)).toEqual({ authenticated: false });
  // fresh-purchase: the buyer has no password and an unverified mailbox.
  seed("fresh-purchase");
  const res = await login(ctx, A, PARITY_PASSWORD);
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual(INVALID_CREDENTIALS);
});

test("A-01/X-06 after 5 failures the correct password gets the same 400 (rate-limited is indistinguishable) @api @auth @security", async () => {
  const ctx = await client();
  for (let i = 0; i < 5; i++) expect((await login(ctx, A, `Wrong-Pass-${i}!`)).status()).toBe(400);
  const res = await login(ctx, A, PARITY_PASSWORD);
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual(INVALID_CREDENTIALS);
  expect(await session(ctx)).toEqual({ authenticated: false });
});

test("A-01/X-06 a successful login clears the failure bucket @api @auth @security", async () => {
  const ctx = await client();
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 4; i++) expect((await login(ctx, A, `Wrong-Pass-${i}!`)).status()).toBe(400);
    const ok = await login(ctx, A, PARITY_PASSWORD);
    expect(ok.status(), `round ${round}`).toBe(200);
  }
});

test("A-02 logout returns ok and the session then reports authenticated:false @api @auth", async () => {
  const ctx = await client();
  await login(ctx, A, PARITY_PASSWORD);
  const before = await ctx.storageState();
  const res = await ctx.post("/api/auth/logout");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(authHeaders(res).cacheControl).toBe("no-store");
  expect(await session(ctx)).toEqual({ authenticated: false });
  // The old cookie is dead server-side, not just cleared in this client.
  expect(await session(await client({ storageState: before }))).toEqual({ authenticated: false });
});

test("A-09 password change: anonymous is 401 UNAUTHORIZED @api @auth", async () => {
  const res = await (await client()).post("/api/auth/password", { data: { currentPassword: PARITY_PASSWORD, newPassword: NEW_PASSWORD } });
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ error: { code: "UNAUTHORIZED", message: GENERIC_FAILURE } });
});

test("A-09 password change: INVALID_PASSWORD_CHANGE, CURRENT_PASSWORD_INVALID, then 429 on the sixth attempt @api @auth", async () => {
  const ctx = await client();
  await login(ctx, A, PARITY_PASSWORD);
  for (const body of [
    { currentPassword: "", newPassword: NEW_PASSWORD },
    { currentPassword: PARITY_PASSWORD, newPassword: PARITY_PASSWORD },
    { currentPassword: PARITY_PASSWORD, newPassword: "short" },
    { currentPassword: PARITY_PASSWORD, newPassword: "a".repeat(73) },
  ]) {
    const res = await ctx.post("/api/auth/password", { data: body });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "INVALID_PASSWORD_CHANGE", message: GENERIC_FAILURE } });
  }
  const wrong = await ctx.post("/api/auth/password", { data: { currentPassword: "Wrong-Pass-2026!", newPassword: NEW_PASSWORD } });
  expect(wrong.status()).toBe(400);
  expect(await wrong.json()).toEqual({ error: { code: "CURRENT_PASSWORD_INVALID", message: GENERIC_FAILURE } });
  expect(await session(ctx)).toMatchObject({ authenticated: true });
  // Sixth attempt in the window: the per-user bucket (5 / 15 min) answers 429.
  const limited = await ctx.post("/api/auth/password", { data: { currentPassword: PARITY_PASSWORD, newPassword: NEW_PASSWORD } });
  expect(limited.status()).toBe(429);
  expect(await limited.json()).toEqual({ error: { code: "RATE_LIMITED" } });
});

test("A-09 password change signs out every session including the current one @api @auth", async () => {
  const ctx = await client();
  await login(ctx, A, PARITY_PASSWORD);
  const other = await client();
  await login(other, A, PARITY_PASSWORD);
  const before = await ctx.storageState();
  const res = await ctx.post("/api/auth/password", { data: { currentPassword: PARITY_PASSWORD, newPassword: NEW_PASSWORD } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true, signedOut: true });
  expect(authHeaders(res).cacheControl).toBe("no-store");
  expect(await session(ctx)).toEqual({ authenticated: false });
  expect(await session(await client({ storageState: before }))).toEqual({ authenticated: false });
  expect(await session(other)).toEqual({ authenticated: false });
  expect((await login(await client(), A, PARITY_PASSWORD)).status()).toBe(400);
  expect((await login(await client(), A, NEW_PASSWORD)).status()).toBe(200);
});

test("A-17 auth wrapper: non-JSON content type is 400 INVALID_JSON @api @auth @security", async () => {
  const ctx = await client();
  for (const path of ["/api/auth/login", "/api/auth/magic-link", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/magic-link/verify"]) {
    const res = await ctx.post(path, { data: Buffer.from(`{"email":"${A}"}`), headers: { "content-type": "text/plain" } });
    expect(res.status(), path).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "INVALID_JSON" } });
    expect(authHeaders(res).cacheControl).toBe("no-store");
  }
});

test("A-17 auth wrapper: a body over 8192 bytes is 413 PAYLOAD_TOO_LARGE @api @auth @security", async () => {
  const ctx = await client();
  const big = JSON.stringify({ email: A, password: "x".repeat(8200) });
  const res = await ctx.post("/api/auth/login", { data: Buffer.from(big), headers: { "content-type": "application/json" } });
  expect(res.status()).toBe(413);
  expect(await res.json()).toEqual({ error: { code: "PAYLOAD_TOO_LARGE" } });
  // Exactly at the cap is still parsed (and then fails as credentials).
  const pad = 8192 - JSON.stringify({ email: A, password: "" }).length;
  const edge = await ctx.post("/api/auth/login", { data: Buffer.from(JSON.stringify({ email: A, password: "x".repeat(pad) })), headers: { "content-type": "application/json" } });
  expect(edge.status()).toBe(400);
  expect(await edge.json()).toEqual(INVALID_CREDENTIALS);
});

test("A-17 auth wrapper: malformed JSON or a non-object body is the generic 400 AUTH_FAILED @api @auth @security", async () => {
  const ctx = await client();
  for (const raw of ["{not json", "[]", "null", "\"text\""]) {
    const res = await ctx.post("/api/auth/login", { data: Buffer.from(raw), headers: { "content-type": "application/json" } });
    expect(res.status(), raw).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "AUTH_FAILED", message: GENERIC_FAILURE } });
  }
});

test("A-17/X-02 auth responses carry Cache-Control no-store and the site Referrer-Policy @api @auth @security", async () => {
  // Next: http.ts sets no-referrer, but next.config.ts's global Referrer-Policy header wins on /api/auth/*.
  const ctx = await client();
  for (const res of [
    await ctx.get("/api/auth/session"),
    await login(ctx, A, "Wrong-Pass-2026!"),
    await ctx.post("/api/auth/magic-link", { data: { email: A } }),
  ]) {
    expect(authHeaders(res)).toEqual({ cacheControl: "no-store", referrerPolicy: "strict-origin-when-cross-origin" });
  }
});

const GUARDED = ["/api/auth/login", "/api/auth/logout", "/api/auth/password", "/api/auth/magic-link", "/api/auth/magic-link/verify", "/api/auth/forgot-password", "/api/auth/reset-password"];

test("X-01 auth mutations reject a foreign, null or empty Origin with 403 INVALID_ORIGIN before any work @api @auth @security", async () => {
  for (const origin of ["http://evil.example", "null", "", "http://127.0.0.1:1", `${base}/`, base.replace("127.0.0.1", "localhost")]) {
    const ctx = await client({ origin: null, headers: { Origin: origin } });
    for (const path of GUARDED) {
      // Not even JSON: the guard runs before body parsing.
      const res = await ctx.post(path, { data: Buffer.from("x"), headers: { "content-type": "text/plain" } });
      expect(res.status(), `${origin} ${path}`).toBe(403);
      expect(await res.json()).toEqual(INVALID_ORIGIN);
    }
  }
  // A good Referer never rescues a bad Origin.
  const ctx = await client({ origin: null, headers: { Origin: "http://evil.example" } });
  const res = await login(ctx, A, PARITY_PASSWORD);
  expect(res.status()).toBe(403);
  const res2 = await ctx.post("/api/auth/login", { data: { email: A, password: PARITY_PASSWORD }, headers: { Referer: `${base}/login` } });
  expect(res2.status()).toBe(403);
});

test("X-01 without an Origin, only a same-origin Referer without fragment or credentials is accepted @api @auth @security", async () => {
  const host = new URL(base).host;
  const noOrigin = await client({ origin: null });
  const attempt = (referer?: string) => noOrigin.post("/api/auth/login", { data: { email: A, password: PARITY_PASSWORD }, headers: referer ? { Referer: referer } : {} });
  for (const referer of [undefined, base, `${base}/login#frag`, `http://user:pw@${host}/login`, "http://evil.example/login", `${base}.evil.example/login`, `${base}/lo\\gin`]) {
    const res = await attempt(referer);
    expect(res.status(), String(referer)).toBe(403);
    expect(await res.json()).toEqual(INVALID_ORIGIN);
  }
  const ok = await attempt(`${base}/login?next=%2Fdashboard`);
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ ok: true });
});
