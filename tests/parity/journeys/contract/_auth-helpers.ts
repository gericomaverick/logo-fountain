// Story 0.7a helpers for the auth and checkout contract suites (L4, black-box, target-neutral).
import { request as pwRequest, type APIRequestContext, type APIResponse } from "@playwright/test";
import { baseURL } from "../../adapters/api";
import { mailpitUrl } from "../../adapters/mail";
import { lockDbForFile, releaseDb, seed } from "../../adapters/seed";
import { postmarkShimUrl, stripeFakeUrl, withMailInFlight } from "../../adapters/stripe";

export const MAILPIT_URL = mailpitUrl;
export const POSTMARK_SHIM_URL = postmarkShimUrl;
export const STRIPE_FAKE_URL = stripeFakeUrl;
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
// Every file here reseeds the shared database, so it holds the suite's exclusive DB lease for its whole run
// (adapters/seed.ts, story 0.8a). Kept as names the 0.7a specs already call from beforeAll/afterAll.
export const acquireDbLock = () => lockDbForFile("exclusive");
export const releaseDbLock = () => releaseDb();
export { seed };

// ---------- Mailpit (moved to adapters/mail.ts in story 0.8a) ----------
export { mailbox, proofLink, type Mail } from "../../adapters/mail";

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
  // The fake posts the webhook (and so the emails) before it answers: count it as mail in flight.
  const paid = await withMailInFlight(() => fetch(`${STRIPE_FAKE_URL}/pay/${id}/complete`, {
    method: "POST", headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ email, first_name: "Parity", last_name: "Buyer" }),
  }));
  if (!paid.ok) throw new Error(`stripe-fake pay failed: ${paid.status}`);
  for (let i = 0; i < 75; i++) {
    const status = await (await ctx.get(`/api/checkout/status?session_id=${id}`)).json();
    if (status.fulfilled) { await ctx.dispose(); return id; }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`session ${id} was never fulfilled`);
}

export const uniqueEmail = (tag: string) => `${tag}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@parity.test`;
