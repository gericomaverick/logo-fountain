// Story 0.7a helpers for the auth and checkout contract suites (L4, black-box, target-neutral).
// Own small Mailpit reader on purpose: the shared mail adapter (adapters/mail.ts) belongs to story 0.8a.
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as pwRequest, type APIRequestContext, type APIResponse } from "@playwright/test";
import { baseURL } from "../../adapters/api";
import { seed } from "../../adapters/seed";

const port = (name: string, fallback: string) => process.env[name] || fallback;
// Same variables and defaults as infra/lib/env.mjs and docker-compose.test.yml.
export const MAILPIT_URL = `http://127.0.0.1:${port("PARITY_MAILPIT_PORT", "58025")}`;
export const POSTMARK_SHIM_URL = `http://127.0.0.1:${port("PARITY_POSTMARK_PORT", "58090")}`;
export const STRIPE_FAKE_URL = `http://127.0.0.1:${port("PARITY_STRIPE_PORT", "58091")}`;
const STRIPE_TEST_KEY = "sk_test_parity_test_only";

// Byte-for-byte contract strings (brownfield/auth-and-security.md §4, §10).
export const GENERIC_FAILURE = "Authentication could not be completed. Check your details or request a new link.";
export const INVALID_CREDENTIALS = { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect, or mailbox verification is required." } };
export const MAGIC_SENT = { ok: true, message: "If that account exists, a sign-in link has been sent." };
export const RESET_SENT = { ok: true, message: "If that account exists, a password recovery email has been sent." };
export const INVALID_ORIGIN = { error: { code: "INVALID_ORIGIN", message: "Request origin is not allowed." } };

/** A cookie-isolated client. Sends the canonical Origin unless `origin: null`; extra headers override. */
export async function client(options: { origin?: string | null; headers?: Record<string, string>; storageState?: Awaited<ReturnType<APIRequestContext["storageState"]>> } = {}) {
  const headers: Record<string, string> = { ...(options.origin === null ? {} : { Origin: options.origin ?? baseURL }), ...options.headers };
  return pwRequest.newContext({ baseURL, extraHTTPHeaders: headers, storageState: options.storageState });
}

export async function session(ctx: APIRequestContext) {
  const res = await ctx.get("/api/auth/session");
  return (await res.json()) as { authenticated: boolean; userId?: string; email?: string; isAdmin?: boolean };
}

export const login = (ctx: APIRequestContext, email: string, password: string) => ctx.post("/api/auth/login", { data: { email, password } });

export function setCookies(res: APIResponse): string[] {
  return res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
}

/** Every auth endpoint answers through the auth JSON wrapper (§4). */
export function authHeaders(res: APIResponse) {
  return { cacheControl: res.headers()["cache-control"], referrerPolicy: res.headers()["referrer-policy"] };
}

// ---------- cross-file serialisation ----------
// Every file here reseeds one shared database. `fullyParallel` would otherwise run two files at once,
// so each file holds this lock (keyed by base URL and DB) for its whole run. Stale locks (dead pid) are taken over.
const lockDir = join(tmpdir(), `lf-parity-db-${createHash("sha256").update(`${baseURL}|${process.env.PARITY_DATABASE_URL ?? ""}`).digest("hex").slice(0, 16)}.lock`);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
export async function acquireDbLock(timeoutMs = 600_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      mkdirSync(lockDir);
      const fd = openSync(join(lockDir, "pid"), "w"); writeSync(fd, String(process.pid)); closeSync(fd);
      return;
    } catch {
      let owner = NaN;
      try { owner = Number(readFileSync(join(lockDir, "pid"), "utf8")); } catch { /* being written */ }
      if (Number.isFinite(owner) && owner > 0 && !alive(owner)) { rmSync(lockDir, { recursive: true, force: true }); continue; }
      if (Date.now() > until) throw new Error(`timed out waiting for ${lockDir}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
export function releaseDbLock() {
  try { if (Number(readFileSync(join(lockDir, "pid"), "utf8")) === process.pid) rmSync(lockDir, { recursive: true, force: true }); } catch { /* not held */ }
}
export { seed };

// ---------- Mailpit ----------
type MailSummary = { ID: string; To: Array<{ Address: string }>; Subject: string };
export type Mail = { id: string; subject: string; text: string; html: string };

async function mailIdsTo(to: string): Promise<Set<string>> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=500`);
  const body = (await res.json()) as { messages: MailSummary[] };
  return new Set(body.messages.filter((m) => m.To.some((a) => a.Address.toLowerCase() === to.toLowerCase())).map((m) => m.ID));
}

/** Snapshot a mailbox, act, then read what arrived after the snapshot. */
export async function mailbox(to: string) {
  const before = await mailIdsTo(to);
  const fresh = async () => [...(await mailIdsTo(to))].filter((id) => !before.has(id));
  return {
    /** Waits for exactly `count` new messages (default 1) and returns them, newest first. */
    async next(count = 1, timeoutMs = 15_000): Promise<Mail[]> {
      const until = Date.now() + timeoutMs;
      let ids = await fresh();
      while (ids.length < count && Date.now() < until) { await new Promise((r) => setTimeout(r, 200)); ids = await fresh(); }
      if (ids.length < count) throw new Error(`expected ${count} new email(s) to ${to}, got ${ids.length}`);
      return Promise.all(ids.map(async (id) => {
        const m = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as { Subject: string; Text: string; HTML: string };
        return { id, subject: m.Subject, text: m.Text, html: m.HTML };
      }));
    },
    /** Count of new messages after a settle delay (for "nothing was sent" assertions; allows queued senders). */
    async countAfterSettle(settleMs = 2_000) {
      await new Promise((r) => setTimeout(r, settleMs));
      return (await fresh()).length;
    },
  };
}

/** The single mailbox-proof link in an email: path, token and next from the URL fragment. */
export function proofLink(mail: Mail) {
  const urls = [...mail.text.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]).filter((u) => u.includes("#"));
  if (urls.length !== 1) throw new Error(`expected one fragment link in "${mail.subject}", found ${urls.length}`);
  const url = new URL(urls[0]);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return { url, origin: url.origin, path: url.pathname, query: url.search, token: fragment.get("token") ?? "", next: fragment.get("next") ?? "" };
}

// ---------- postmark-shim ----------
export async function failNextEmails(count: number) {
  await fetch(`${POSTMARK_SHIM_URL}/__fail`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count }) });
}
export async function clearEmailFailures() {
  await fetch(`${POSTMARK_SHIM_URL}/__reset`, { method: "POST" });
}

// ---------- stripe-fake ----------
export async function stripeSession(id: string) {
  const res = await fetch(`${STRIPE_FAKE_URL}/v1/checkout/sessions/${id}`, { headers: { authorization: `Bearer ${STRIPE_TEST_KEY}` } });
  return (await res.json()) as { id: string; metadata: Record<string, string>; success_url: string; payment_status: string };
}

/**
 * A real purchase through the app: GET /checkout/start, pay on the stripe-fake hosted page (which posts the
 * signed webhook to the app). Returns the new session ID once the app reports it fulfilled.
 * Fresh session IDs and buyer emails keep the checkout-email limits (process-local on Next) independent per test.
 */
export async function purchase(email: string, packageCode = "essential") {
  const ctx = await client({ origin: null });
  const start = await ctx.get(`/checkout/start?package_code=${packageCode}`, { maxRedirects: 0 });
  const location = start.headers()["location"] ?? "";
  const id = location.match(/\/pay\/([^/?#]+)/)?.[1];
  if (start.status() !== 303 || !id) throw new Error(`checkout start failed: ${start.status()} ${location}`);
  const paid = await fetch(`${STRIPE_FAKE_URL}/pay/${id}/complete`, {
    method: "POST", headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ email, first_name: "Parity", last_name: "Buyer" }),
  });
  if (!paid.ok) throw new Error(`stripe-fake pay failed: ${paid.status}`);
  for (let i = 0; i < 75; i++) {
    const status = await (await ctx.get(`/api/checkout/status?session_id=${id}`)).json();
    if (status.fulfilled) { await ctx.dispose(); return id; }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`session ${id} was never fulfilled`);
}

export const uniqueEmail = (tag: string) => `${tag}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@parity.test`;
