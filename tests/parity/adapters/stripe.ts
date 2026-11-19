// stripe-fake helpers for webhook contract tests (story 0.5).
// Fixtures (fixtures/stripe/*.json) are loaded into the running fake with fresh IDs per test, and events are
// built, signed (same scheme as infra/stripe-fake/server.mjs signPayload) and POSTed to the target ourselves,
// so a test controls the event ID (duplicate deliveries) and needs no route from Docker back to the app.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { APIRequestContext } from "@playwright/test";
import { apiClient, baseURL } from "./api";
import { seed } from "./seed";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const stripeFakeUrl = (process.env.PARITY_STRIPE_URL || `http://127.0.0.1:${process.env.PARITY_STRIPE_PORT || "58091"}`).replace(/\/$/, "");
export const postmarkShimUrl = (process.env.PARITY_POSTMARK_URL || `http://127.0.0.1:${process.env.PARITY_POSTMARK_PORT || "58090"}`).replace(/\/$/, "");
/** TEST-ONLY secrets, as in infra/docker-compose.test.yml. */
export const WEBHOOK_SECRET = "whsec_parity_test_only_0000000000000000";
const SECRET_KEY = "sk_test_parity_test_only";
export const ADMIN_EMAIL = process.env.PARITY_ADMIN_EMAIL || "admin@parity.test";
/** Seed scenario these suites run on: an admin plus client.a@parity.test with a password (returning customer). */
export const WEBHOOK_SCENARIO = "awaiting-brief";
export const RETURNING_CUSTOMER_EMAIL = "client.a@parity.test";

export type StripeSession = Record<string, any> & { id: string };
export type LoadedFixture = { run: string; sessionId: string; session: StripeSession; email: string | null; fixture: Record<string, any> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Seeds the scenario once per Playwright run (all workers share the runner as parent process), because
 * seeding truncates the database and spec files run in parallel. Later callers wait for the first.
 */
export async function seedOnceForRun(scenario = WEBHOOK_SCENARIO): Promise<void> {
  const key = createHash("sha256").update(`${process.ppid}:${baseURL}:${scenario}:${process.env.PARITY_DATABASE_URL ?? ""}`).digest("hex").slice(0, 16);
  const base = join(tmpdir(), `lf-parity-seed-${key}`);
  try {
    writeFileSync(`${base}.lock`, String(process.pid), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    for (const deadline = Date.now() + 180_000; Date.now() < deadline; await sleep(200)) {
      if (existsSync(`${base}.done`)) return;
      if (existsSync(`${base}.failed`)) throw new Error(`seeding ${scenario} failed in another worker: ${readFileSync(`${base}.failed`, "utf8")}`);
    }
    throw new Error(`timed out waiting for another worker to seed ${scenario}`);
  }
  try {
    seed(scenario);
    writeFileSync(`${base}.done`, "");
  } catch (error) {
    writeFileSync(`${base}.failed`, String((error as Error).message).slice(0, 2000));
    throw error;
  }
}

async function fakeAdmin(path: string, body: unknown) {
  const res = await fetch(`${stripeFakeUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`stripe-fake ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

/**
 * Loads fixtures/stripe/<name>.json into the fake. With `unique` (default), every fixture object ID gets a
 * per-test suffix and every `x@example.test` becomes `x.<run>@example.test`, so tests never share
 * sessions, orders or mailboxes. Pass the same `run` to give two fixtures the same buyer (package + upsell).
 * `keepEmails` keeps the addresses (e.g. a seeded account). `vars` fills `{{name}}` placeholders; `sessionOverrides` patches the (first) session, e.g. `{payment_status:"paid"}`.
 */
export async function loadStripeFixture(
  name: string,
  options: { run?: string; unique?: boolean; keepEmails?: boolean; vars?: Record<string, string>; sessionOverrides?: Record<string, unknown> } = {},
): Promise<LoadedFixture> {
  const run = options.run ?? newRun();
  let text = readFileSync(join(root, "fixtures/stripe", `${name}.json`), "utf8");
  if (options.unique !== false) {
    text = text.replace(/\b((?:cs_test|cus|pi|ch|in)_parity_[a-z0-9_]+)/g, `$1_${run}`);
    if (!options.keepEmails) text = text.replace(/([A-Za-z0-9.+-]+)@example\.test/g, `$1.${run}@example.test`);
  }
  for (const [k, v] of Object.entries(options.vars ?? {})) text = text.split(`{{${k}}}`).join(v);
  const fixture = JSON.parse(text);
  const session = fixture.checkout_sessions[0];
  Object.assign(session, options.sessionOverrides ?? {});
  delete fixture.description;
  await fakeAdmin("/__fixtures/load", { fixture });
  const email = session.customer_details?.email ? String(session.customer_details.email).trim().toLowerCase() : null;
  return { run, sessionId: session.id, session: await retrieveSession(session.id), email, fixture };
}

export const newRun = () => `r${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

/** Re-loads an already loaded fixture with patched session fields (line items are kept). */
export async function patchSession(loaded: LoadedFixture, overrides: Record<string, unknown>): Promise<StripeSession> {
  const fixture = structuredClone(loaded.fixture);
  Object.assign(fixture.checkout_sessions[0], overrides);
  await fakeAdmin("/__fixtures/load", { fixture });
  return retrieveSession(loaded.sessionId);
}

/** GET /v1/checkout/sessions/:id from the fake, as the Stripe API returns it. */
export async function retrieveSession(id: string): Promise<StripeSession> {
  const res = await fetch(`${stripeFakeUrl}/v1/checkout/sessions/${id}`, { headers: { authorization: `Bearer ${SECRET_KEY}` } });
  if (!res.ok) throw new Error(`retrieve ${id}: ${res.status} ${await res.text()}`);
  return (await res.json()) as StripeSession;
}

export type StripeEvent = { id: string; type: string; created: number; data: { object: unknown }; [k: string]: unknown };

export function buildEvent(type: string, object: unknown, id = `evt_parity_${randomBytes(12).toString("hex")}`): StripeEvent {
  return { id, object: "event", api_version: "2026-02-25.clover", created: Math.floor(Date.now() / 1000), data: { object },
    livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null }, type };
}

/** Stripe-Signature header value: `t=<ts>,v1=HMAC-SHA256(secret, "<ts>.<payload>")`. */
export function signPayload(payload: string, secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

export type Delivery = { status: number; body: any; text: string };

// The email transport's failure switch (postmark-shim /__fail) is global, so a test that arms it must not
// run while another worker's webhook is sending mail. Deliveries hold a shared lock (a file per in-flight
// delivery); withEmailFailures takes it exclusively. Scoped to this run (runner pid) and target.
const runKey = createHash("sha256").update(`${process.ppid}:${baseURL}`).digest("hex").slice(0, 16);
const lockDir = join(tmpdir(), `lf-parity-locks-${runKey}`);
const exclusiveFile = join(lockDir, "exclusive");
let holdingExclusive = false;

async function sharedDelivery<T>(fn: () => Promise<T>): Promise<T> {
  if (holdingExclusive) return fn();
  mkdirSync(lockDir, { recursive: true });
  for (;;) {
    while (existsSync(exclusiveFile)) await sleep(50);
    const mine = join(lockDir, `inflight-${process.pid}-${randomBytes(4).toString("hex")}`);
    writeFileSync(mine, "");
    if (existsSync(exclusiveFile)) { rmSync(mine, { force: true }); continue; }
    try { return await fn(); } finally { rmSync(mine, { force: true }); }
  }
}

/** Runs `fn` with no other webhook delivery in flight, so email failures armed inside it hit only this test. */
export async function withEmailFailures<T>(fn: () => Promise<T>): Promise<T> {
  mkdirSync(lockDir, { recursive: true });
  for (;;) {
    try { writeFileSync(exclusiveFile, String(process.pid), { flag: "wx" }); break; } catch { await sleep(50); }
  }
  holdingExclusive = true;
  try {
    while (readdirSync(lockDir).some((n) => n.startsWith("inflight-"))) await sleep(50);
    return await fn();
  } finally {
    await clearEmailFailures();
    holdingExclusive = false;
    rmSync(exclusiveFile, { force: true });
  }
}

/** POSTs a signed event to the target's webhook route, like Stripe does. */
export function deliverEvent(event: StripeEvent, options: { signature?: string | null; secret?: string } = {}): Promise<Delivery> {
  return sharedDelivery(() => postEvent(event, options));
}

async function postEvent(event: StripeEvent, options: { signature?: string | null; secret?: string }): Promise<Delivery> {
  const payload = JSON.stringify(event, null, 2);
  const signature = options.signature === undefined ? signPayload(payload, options.secret) : options.signature;
  const res = await fetch(`${baseURL}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", "user-agent": "Stripe/1.0 (+https://stripe.com/docs/webhooks)", ...(signature === null ? {} : { "stripe-signature": signature }) },
    body: payload,
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* plain-text error */ }
  return { status: res.status, body, text };
}

/** Makes the next `count` emails sent through postmark-shim fail with 500 (Next's transport). */
export async function failNextEmailSends(count = 1): Promise<void> {
  const res = await fetch(`${postmarkShimUrl}/__fail`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count }) });
  if (!res.ok) throw new Error(`postmark-shim /__fail: ${res.status}`);
}

export async function clearEmailFailures(): Promise<void> {
  await fetch(`${postmarkShimUrl}/__fail`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count: 0 }) });
}

// ---- reading the outcome back through the public API ----

export async function checkoutStatus(sessionId: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseURL}/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`);
  return { status: res.status, body: await res.json() };
}

/**
 * Signs in through the real login route, one worker at a time: Next reserves a per-email failure slot
 * before checking the password (lib/auth/rate-limit.ts:46, limit 5), so more than five parallel sign-ins
 * of one account are refused even with the right password.
 */
export async function signInSerialised(email: string): Promise<APIRequestContext> {
  mkdirSync(lockDir, { recursive: true });
  const file = join(lockDir, `login-${createHash("sha256").update(email).digest("hex").slice(0, 12)}`);
  for (;;) {
    try { writeFileSync(file, String(process.pid), { flag: "wx" }); break; } catch { await sleep(25); }
  }
  try { return await apiClient({ signInAs: email }); } finally { rmSync(file, { force: true }); }
}

let admin: Promise<APIRequestContext> | null = null;
/** The seeded admin, signed in once per worker. */
export const adminClient = (): Promise<APIRequestContext> => (admin ??= signInSerialised(ADMIN_EMAIL));

/** Every project whose latest order is this Checkout Session (admin GET /api/admin/projects). */
export async function projectsForSession(admin: APIRequestContext, sessionId: string): Promise<any[]> {
  const res = await admin.get("/api/admin/projects");
  if (!res.ok()) throw new Error(`GET /api/admin/projects: ${res.status()}`);
  const { projects } = await res.json();
  return projects.filter((p: any) => p.latestOrder?.stripeCheckoutSessionId === sessionId);
}

export async function adminSnapshot(admin: APIRequestContext, projectId: string): Promise<any> {
  const res = await admin.get(`/api/admin/projects/${projectId}`);
  if (!res.ok()) throw new Error(`GET /api/admin/projects/${projectId}: ${res.status()}`);
  return (await res.json()).snapshot;
}

export async function auditTypes(admin: APIRequestContext, projectId: string): Promise<string[]> {
  const res = await admin.get(`/api/admin/projects/${projectId}/audit`);
  if (!res.ok()) throw new Error(`GET audit: ${res.status()}`);
  return (await res.json()).events.map((e: any) => e.type);
}

export async function auditEvents(admin: APIRequestContext, projectId: string): Promise<Array<{ type: string; payload: any }>> {
  const res = await admin.get(`/api/admin/projects/${projectId}/audit`);
  if (!res.ok()) throw new Error(`GET audit: ${res.status()}`);
  return (await res.json()).events;
}

/** Loads a paid package fixture and delivers checkout.session.completed; returns the fulfilled project ID. */
export async function buyPackage(name: string, run = newRun()): Promise<LoadedFixture & { projectId: string }> {
  const loaded = await loadStripeFixture(name, { run });
  const res = await deliverEvent(buildEvent("checkout.session.completed", loaded.session));
  if (res.status !== 200 || res.body?.fulfilled !== true) throw new Error(`package purchase not fulfilled: ${res.status} ${res.text}`);
  return { ...loaded, projectId: res.body.projectId };
}
