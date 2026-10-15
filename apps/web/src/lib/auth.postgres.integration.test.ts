import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const mail = vi.hoisted(() => [] as Array<{ email: string; link: string; kind: string }>);
vi.mock("@/lib/auth/mail", () => ({ sendAuthEmail: async (email: string, link: string, kind: string) => { mail.push({ email, link, kind }); } }));
vi.mock("@/lib/stripe", () => ({ PRICE_ID_TO_PACKAGE: { price_test: "essential" }, stripe: { checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: "price_test" } }] }) } } } }));
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
