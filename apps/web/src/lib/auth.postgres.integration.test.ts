import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const mail = vi.hoisted(() => [] as Array<{ email: string; link: string; kind: string }>);
// Test-process transport only. `before` lets a test delay or fail delivery.
const transport = vi.hoisted(() => ({ before: null as null | ((email: string, link: string) => Promise<void>) }));
vi.mock("@/lib/auth/mail", () => ({ sendAuthEmail: async (email: string, link: string, kind: string) => { await transport.before?.(email, link); mail.push({ email, link, kind }); } }));
vi.mock("@/lib/stripe", () => ({ PRICE_ID_TO_PACKAGE: { price_test: "essential" }, stripe: { webhooks: { constructEvent: (body: string) => JSON.parse(body) }, checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: "price_test" } }] }) } } } }));
vi.mock("@/lib/project-lifecycle-email", () => ({ notifyAdminNewProject: async () => ({ status: "sent" }) }));
const enabled = process.env.RUN_PG_INTEGRATION === "1";
if (enabled) {
  const url = new URL(process.env.PG_INTEGRATION_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/lf_exit_test" || url.username !== "lf_runtime") throw new Error("Owned isolated PG only");
}
describe.skipIf(!enabled)("real PostgreSQL Better Auth lifecycle and credential fencing", () => {
  let db: typeof import("@/lib/prisma").prisma;
  let auth: typeof import("@/lib/auth/service");
  let provision: typeof import("@/lib/checkout-fulfillment");
  const headers = () => new Headers({ origin: process.env.PUBLIC_SITE_URL!, "content-type": "application/json" });
  const password = "Initial-strong-password-123";
  const replacement = "Replacement-password-456";
  const token = (link: string) => new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;
  const cookies = (response: Response) => new Headers({ ...Object.fromEntries(headers()), cookie: response.headers.getSetCookie().map((c) => c.split(";", 1)[0]).join("; ") });
  beforeAll(async () => {
    db = (await import("@/lib/prisma")).prisma;
    auth = await import("@/lib/auth/service");
    provision = await import("@/lib/checkout-fulfillment");
  });
  afterAll(async () => { await db?.$disconnect(); });
  async function purchaser() {
    const email = `${randomUUID()}@example.invalid`;
    const paid = await provision.fulfillCheckoutSession({ id: "cs_test_" + randomUUID(), payment_status: "paid", customer_details: { email, name: "Isolated Buyer" }, amount_total: 4900, currency: "gbp", payment_intent: "pi_" + randomUUID() } as never);
    const identity = await provision.ensureAccessProvisioning(paid.clientId, email);
    return { email, ...paid, ...identity };
  }
  async function link(email: string, kind: "setup" | "reset" | "magic") {
    await auth.requestAuthLink(email, kind, "/dashboard", headers());
    const sent = mail.findLast((m) => m.email === email)!;
    expect(new URL(sent.link).origin).toBe(process.env.PUBLIC_SITE_URL);
    expect(new URL(sent.link).searchParams.has("token")).toBe(false);
    return token(sent.link);
  }
  async function verified() {
    const p = await purchaser();
    await auth.resetCredential(await link(p.email, "setup"), password, headers());
    return p;
  }
  it("atomically provisions normalized shared UUID/profile/membership under 12-way contention, without mailbox/admin promotion", async () => {
    const p = await purchaser();
    const results = await Promise.all(Array.from({ length: 12 }, () => provision.ensureAccessProvisioning(p.clientId, ` ${p.email.toUpperCase()} `)));
    expect(new Set(results.map((r) => r.userId))).toEqual(new Set([p.userId]));
    const user = await db.authUser.findUniqueOrThrow({ where: { id: p.userId }, include: { profile: true, accounts: true } });
    expect(user.emailVerified).toBe(false); expect(user.profile?.id).toBe(user.id); expect(user.profile?.isAdmin).toBe(false); expect(user.accounts).toHaveLength(0);
    expect(await db.clientMembership.count({ where: { clientId: p.clientId, userId: p.userId } })).toBe(1);
    await expect(provision.ensureAccessProvisioning(p.clientId, "attacker@example.invalid")).rejects.toThrow();
    await expect(provision.fulfillCheckoutSession({ id: "cs_unpaid", payment_status: "unpaid" } as never)).rejects.toThrow();
  });
  it("setup requires single-use mailbox proof, creates native credential, caps DB session at absolute seven days", async () => {
    const p = await purchaser();
    const proof = await link(p.email, "setup");
    expect(await db.authVerification.count()).toBeGreaterThan(0);
    const rawRows = await db.authVerification.findMany();
    expect(rawRows.some((r) => r.identifier.includes(proof) || r.value.includes(proof))).toBe(false);
    await auth.resetCredential(proof, password, headers());
    await expect(auth.resetCredential(proof, replacement, headers())).rejects.toThrow();
    const response = await auth.login(p.email, password, headers());
    expect(response.ok).toBe(true);
    const state = await auth.sessionFromHeaders(cookies(response));
    expect(state?.user.id).toBe(p.userId);
    expect(state!.session.expiresAt.getTime() - state!.session.createdAt.getTime()).toBeLessThanOrEqual(7 * 86400000 + 1000);
    const originalExpiry = state!.session.expiresAt.getTime();
    await auth.sessionFromHeaders(cookies(response));
    expect((await db.authSession.findUniqueOrThrow({ where: { id: state!.session.id } })).expiresAt.getTime()).toBe(originalExpiry);
    await db.authSession.update({ where: { id: state!.session.id }, data: { createdAt: new Date(Date.now() - 8 * 86400000), expiresAt: new Date(Date.now() + 86400000) } });
    expect(await auth.sessionFromHeaders(cookies(response))).toBeNull();
  });
  it("single magic-link exchange succeeds exactly once, marks mailbox verified, but ordinary login is not first-password proof", async () => {
    const p = await purchaser();
    const proof = await link(p.email, "magic");
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => auth.verifyMagic(proof, headers())));
    const success = results.filter((r): r is PromiseFulfilledResult<Response> => r.status === "fulfilled");
    expect(success).toHaveLength(1);
    expect((await auth.sessionFromHeaders(cookies(success[0].value)))?.user.emailVerified).toBe(true);
    await expect(auth.changeCredential("", password, cookies(success[0].value))).rejects.toThrow();
    expect(await db.authAccount.count({ where: { userId: p.userId } })).toBe(0);
  });
  it("expires setup/recovery at one hour and invalidates ALL distinct outstanding proofs on a credential transition", async () => {
    const p = await verified();
    const expired = await link(p.email, "reset");
    const { proofHash } = await import("@/lib/auth/server");
    await db.authProof.update({ where: { tokenHash: proofHash(expired) }, data: { expiresAt: new Date(Date.now() - 1) } });
    await expect(auth.resetCredential(expired, replacement, headers())).rejects.toThrow();
    const a = await link(p.email, "reset"), b = await link(p.email, "reset"), magic = await link(p.email, "magic");
    const results = await Promise.allSettled([auth.resetCredential(a, replacement, headers()), auth.resetCredential(b, replacement + "B", headers())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.authProof.count({ where: { userId: p.userId } })).toBe(0);
    await expect(auth.verifyMagic(magic, headers())).rejects.toThrow();
  });
  it("reset/change race has one winner; all prior and natively rotated sessions are revoked", async () => {
    const p = await verified();
    const first = await auth.login(p.email, password, headers()), second = await auth.login(p.email, password, headers());
    await expect(auth.changeCredential("Wrong-current-password-0", replacement, cookies(first))).rejects.toMatchObject({ code: "CURRENT_PASSWORD_INVALID" });
    expect(await db.authSession.count({ where: { userId: p.userId } })).toBe(2);
    const proof = await link(p.email, "reset");
    const results = await Promise.allSettled([auth.changeCredential(password, replacement, cookies(first)), auth.resetCredential(proof, replacement + "R", headers())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.authSession.count({ where: { userId: p.userId } })).toBe(0);
    expect(await auth.sessionFromHeaders(cookies(first))).toBeNull(); expect(await auth.sessionFromHeaders(cookies(second))).toBeNull();
    await expect(auth.changeCredential(password, "Another-password-789", cookies(second))).rejects.toThrow();
  });
  it("login/reset fencing leaves no session authorized by the old password after reset commits", async () => {
    const p = await verified();
    const proof = await link(p.email, "reset");
    const results = await Promise.all([auth.login(p.email, password, headers()), auth.resetCredential(proof, replacement, headers())]);
    expect(await db.authSession.count({ where: { userId: p.userId } })).toBe(0);
    if (results[0].ok) expect(await auth.sessionFromHeaders(cookies(results[0]))).toBeNull();
    expect((await auth.login(p.email, password, headers())).ok).toBe(false);
    expect((await auth.login(p.email, replacement, headers())).ok).toBe(true);
  });
  it("database failure AFTER native reset rolls back password, token consume, proof invalidation and session revocation", async () => {
    const p = await verified();
    const oldSession = await auth.login(p.email, password, headers());
    const proof = await link(p.email, "reset");
    const owner = new pg.Client({ connectionString: process.env.DIRECT_URL });
    await owner.connect();
    try {
      // Only the owned disposable migration role can install this fault fixture.
      await owner.query(`CREATE FUNCTION fail_auth_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."actorId"='${p.userId}' AND NEW.type='auth.password_reset' THEN RAISE EXCEPTION 'isolated fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_auth_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_auth_audit()`);
      await expect(auth.resetCredential(proof, replacement, headers())).rejects.toThrow();
      expect((await auth.sessionFromHeaders(cookies(oldSession)))?.user.id).toBe(p.userId);
      expect((await auth.login(p.email, password, headers())).ok).toBe(true);
    } finally { await owner.query('DROP TRIGGER IF EXISTS fail_auth_audit ON "AuditEvent"; DROP FUNCTION IF EXISTS fail_auth_audit()'); await owner.end(); }
    await auth.resetCredential(proof, replacement, headers());
    expect(await auth.sessionFromHeaders(cookies(oldSession))).toBeNull();
  });
  it("M2: webhook retry after a failed first setup email sends SETUP again; once a password exists it never resets it", async () => {
    const { POST: webhook } = await import("@/app/api/stripe/webhook/route");
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_isolated_test";
    const email = `${randomUUID()}@example.invalid`;
    const event = { id: "evt_" + randomUUID(), type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), data: { object: { id: "cs_test_" + randomUUID(), payment_status: "paid", customer_details: { email, name: "Retry Buyer" }, amount_total: 4900, currency: "gbp", payment_intent: "pi_" + randomUUID() } } };
    const deliver = () => webhook(new Request(process.env.PUBLIC_SITE_URL + "/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "isolated" }, body: JSON.stringify(event) }));
    transport.before = async (to) => { if (to === email) throw new Error("postmark down"); };
    try {
      expect((await deliver()).status).toBeGreaterThanOrEqual(500);
    } finally { transport.before = null; }
    const user = await db.authUser.findUniqueOrThrow({ where: { email } });
    expect(await db.authProof.count({ where: { userId: user.id } })).toBe(0);
    expect((await deliver()).status).toBe(200);
    const sent = mail.filter((m) => m.email === email);
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe("setup");
    expect(new URL(sent[0].link).pathname).toBe("/set-password");
    await auth.resetCredential(token(sent[0].link), password, headers());
    // With a credential set, even the trusted setup path issues sign-in only.
    expect(await auth.requestAuthLink(email, "setup", "/dashboard", headers())).toBe("magic");
    expect(new URL(mail.at(-1)!.link).pathname).toBe("/auth/callback");
    await expect(auth.resetCredential(token(mail.at(-1)!.link), replacement, headers())).rejects.toThrow();
    expect((await auth.login(email, password, headers())).ok).toBe(true);
  });
  it("M3: email is sent after commit; a slow send holds neither the user's lock nor the transaction", async () => {
    const p = await verified();
    const probe = new pg.Client({ connectionString: process.env.PG_INTEGRATION_URL });
    await probe.connect();
    try {
      let observed: { committed: number; lockFree: boolean; loginOk: boolean } | null = null;
      transport.before = async (to) => {
        if (to !== p.email) return;
        const committed = await probe.query('SELECT count(*)::int AS n FROM "AuthProof" WHERE "userId"=$1', [p.userId]);
        const lock = await probe.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok", ["auth:" + p.userId]);
        if (lock.rows[0].ok) await probe.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", ["auth:" + p.userId]);
        // The same user's login takes the fence; it must not wait for the send.
        const loginOk = (await auth.login(p.email, password, headers())).ok;
        observed = { committed: committed.rows[0].n, lockFree: lock.rows[0].ok, loginOk };
      };
      expect(await auth.requestAuthLink(p.email, "reset", "/dashboard", headers())).toBe("reset");
      expect(observed).toEqual({ committed: 1, lockFree: true, loginOk: true });
    } finally { transport.before = null; await probe.end(); }
  });
  it("M3: a failed send leaves a dead, non-leaking link and a clean retry", async () => {
    const p = await verified();
    let captured = "";
    transport.before = async (to, link) => { if (to === p.email) { captured = link; throw new Error("provider echo: " + link); } };
    let message = "";
    try {
      await auth.requestAuthLink(p.email, "reset", "/dashboard", headers()).catch((error: Error) => { message = error.message; });
    } finally { transport.before = null; }
    expect(message).toBe("Authentication email delivery failed");
    expect(message).not.toContain(token(captured));
    expect(await db.authProof.count({ where: { userId: p.userId } })).toBe(0);
    await expect(auth.resetCredential(token(captured), replacement, headers())).rejects.toThrow();
    await auth.resetCredential(await link(p.email, "reset"), replacement, headers());
    expect((await auth.login(p.email, replacement, headers())).ok).toBe(true);
  });
  it("M1: successful logins never spend the email budget; failures are limited and spoofed headers cannot escape", async () => {
    const { POST: loginRoute } = await import("@/app/api/auth/login/route");
    const attempt = (email: string, pw: string, xff?: string) => loginRoute(new Request(process.env.PUBLIC_SITE_URL + "/api/auth/login", { method: "POST", headers: { origin: process.env.PUBLIC_SITE_URL!, "content-type": "application/json", ...(xff ? { "x-forwarded-for": xff } : {}) }, body: JSON.stringify({ email, password: pw }) }));
    delete process.env.AUTH_TRUSTED_PROXY_HOPS; delete process.env.AUTH_CLIENT_IP_HEADER;
    try {
      const a = await verified();
      for (let i = 0; i < 8; i++) expect((await attempt(a.email, password)).status).toBe(200);
      const wrong = await attempt(a.email, "Wrong-password-000");
      for (let i = 0; i < 4; i++) expect((await attempt(a.email, "Wrong-password-000", `203.0.113.${i}`)).status).toBe(400);
      // Budget spent: even the right password (any spoofed header) is refused, generically.
      const limited = await attempt(a.email, password, "198.51.100.200");
      expect(limited.status).toBe(400);
      expect(await limited.text()).toBe(await wrong.text());

      process.env.AUTH_TRUSTED_PROXY_HOPS = "1";
      const b = await verified();
      for (let i = 0; i < 5; i++) expect((await attempt(b.email, "Wrong-password-000", `10.0.0.${i}, 198.51.100.1`)).status).toBe(400);
      expect((await attempt(b.email, password, "10.9.9.9, 198.51.100.1")).status).toBe(400);
      // The owner on another address is not locked out by that third party.
      expect((await attempt(b.email, password, "198.51.100.2")).status).toBe(200);
      // A success clears only its own budget and does not count.
      for (let i = 0; i < 3; i++) expect((await attempt(b.email, password, "198.51.100.2")).status).toBe(200);
    } finally { delete process.env.AUTH_TRUSTED_PROXY_HOPS; }
  });
  it("runtime cannot promote an admin or access bootstrap state; operator bootstrap requires verified mailbox and is single-use", async () => {
    const p = await purchaser();
    await expect(db.profile.update({ where: { id: p.userId }, data: { isAdmin: true } })).rejects.toThrow();
    await expect(db.authAdminBootstrap.findMany()).rejects.toThrow();
    const args = ["scripts/bootstrap-admin.mjs", "--email", p.email, "--confirm-user", p.userId, "--ack", "ONE_TIME_ADMIN_BOOTSTRAP"];
    expect(() => execFileSync(process.execPath, args, { stdio: "pipe" })).toThrow();
    await auth.resetCredential(await link(p.email, "setup"), password, headers());
    execFileSync(process.execPath, args, { stdio: "pipe" });
    if (process.env.AUTH_BROWSER_FIXTURE) {
      const setup = await purchaser();
      const reset = await verified();
      await link(setup.email, "setup"); const setupLink = mail.at(-1)!.link;
      await link(reset.email, "reset"); const resetLink = mail.at(-1)!.link;
      const magic = await purchaser(); await link(magic.email, "magic"); const magicLink = mail.at(-1)!.link;
      await writeFile(process.env.AUTH_BROWSER_FIXTURE, JSON.stringify({ setup: { ...setup, link: setupLink }, reset: { ...reset, link: resetLink }, magic: { ...magic, link: magicLink }, admin: p, password }), { mode: 0o600 });
    }
    expect((await db.profile.findUniqueOrThrow({ where: { id: p.userId } })).isAdmin).toBe(true);
    expect(() => execFileSync(process.execPath, args, { stdio: "pipe" })).toThrow();
  });
});
