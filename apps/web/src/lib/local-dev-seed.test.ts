import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, stat, lstat, rename } from "node:fs/promises";
import pg from "pg";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { afterAll, describe, expect, it, vi } from "vitest";

// This is a manual, disposable-cluster-only fixture, NOT an application seed or
// authentication endpoint. The mail transport is mocked in this process alone;
// no bearer URL is sent, printed, committed, or placed in test artifacts.
const mail = vi.hoisted(() => [] as Array<{ email: string; link: string }>);
vi.mock("@/lib/auth/mail", () => ({ sendAuthEmail: async (email: string, link: string) => { mail.push({ email, link }); } }));
vi.mock("@/lib/stripe", () => ({ PRICE_ID_TO_PACKAGE: { price_local_fixture: "essential" }, stripe: { checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: "price_local_fixture" } }] }) } } } }));

const enabled = process.env.PG_LOCAL_DEV_SEED === "1";
if (enabled) {
  // Fail CLOSED before any fixture import, Prisma write, mock proof, or bootstrap.
  // URL equivalence alone is insufficient: also authenticate over the private
  // socket and verify the actual running data_directory and loopback listener.
  const home = resolve(homedir(), ".local/share/logo-fountain/dev-pg-5649");
  const paths = { marker: resolve(home, "marker.json"), config: resolve(home, "config.json"),
    identities: resolve(home, "local-identities.json") };
  if (process.env.LOCAL_DEV_SECRETS_FILE !== resolve(home, "local-credentials.json") ||
      process.env.LOCAL_DEV_IDENTITIES_FILE !== paths.identities || process.env.LOCAL_DEV_HOME !== home ||
      ((await lstat(home)).mode & 0o777) !== 0o700) throw new Error("Private local fixture directory required");
  for (const file of Object.values(paths)) {
    const st = await lstat(file);
    if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077) throw new Error("Private local fixture configuration required");
  }
  const marker = JSON.parse(await readFile(paths.marker, "utf8"));
  const c = JSON.parse(await readFile(paths.config, "utf8"));
  if (marker.kind !== "logo-fountain-private-local-pg-5649" || marker.port !== 45232 ||
      marker.data !== resolve(home, "data") ||
      ![c.ownerPassword, c.migrationPassword, c.runtimePassword].every((pw) => /^[a-f0-9]{48}$/.test(pw)) ||
      new Set([c.ownerPassword, c.migrationPassword, c.runtimePassword]).size !== 3) throw new Error("Invalid local cluster ownership");
  const expected = (role: string, password: string) => `postgresql://${role}:${password}@127.0.0.1:45232/lf_local_dev`;
  if (process.env.DATABASE_URL !== expected("lf_runtime", c.runtimePassword) ||
      process.env.PG_INTEGRATION_URL !== expected("lf_runtime", c.runtimePassword) ||
      process.env.DIRECT_URL !== expected("lf_migration", c.migrationPassword)) {
    throw new Error("Fixture database targets do not match the exact verified helper-owned cluster");
  }
  const owner = new pg.Client({ host: home, port: 45232, user: "cluster_owner", password: c.ownerPassword, database: "postgres" });
  try {
    await owner.connect();
    const result = await owner.query("SELECT current_setting('data_directory') AS dir, current_setting('port')::int AS port, current_setting('listen_addresses') AS listen");
    if (resolve(result.rows[0].dir) !== marker.data || result.rows[0].port !== 45232 || result.rows[0].listen !== "127.0.0.1") {
      throw new Error("Fixture cluster does not match its private local PG socket");
    }
  } finally { await owner.end().catch(() => {}); }
}


describe.skipIf(!enabled)("local-only disposable admin and paid customer fixture", () => {
  let db: typeof import("@/lib/prisma").prisma;
  afterAll(async () => { await db?.$disconnect(); });
  it("uses operator-only bootstrap and real fulfillment, writes credentials to a private file", async () => {
    const file = process.env.LOCAL_DEV_SECRETS_FILE!;
    if (((await stat(process.env.LOCAL_DEV_HOME!)).mode & 0o777) !== 0o700 ||
        JSON.parse(await readFile(resolve(process.env.LOCAL_DEV_HOME!, "marker.json"), "utf8")).kind !== "logo-fountain-private-local-pg-5649") {
      throw new Error("Private, owned fixture directory required");
    }
    db = (await import("@/lib/prisma")).prisma;
    const auth = await import("@/lib/auth/service");
    const { fulfillCheckoutSession, ensureAccessProvisioning } = await import("@/lib/checkout-fulfillment");
    const emails = JSON.parse(await readFile(process.env.LOCAL_DEV_IDENTITIES_FILE!, "utf8"));
    const adminEmail: string = emails.adminEmail;
    const customerEmail: string = emails.customerEmail;
    if (![adminEmail, customerEmail].every((email) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email === email.toLowerCase()) ||
        adminEmail === customerEmail) throw new Error("Two distinct local test identities required");
    const headers = new Headers({ origin: process.env.PUBLIC_SITE_URL!, "content-type": "application/json" });
    const adminPassword = randomBytes(32).toString("base64url");
    // If bootstrap or later fulfillment fails, the owner can inspect this
    // PRIVATE incomplete handoff; never lose the only random admin password.
    await writeFile(file, JSON.stringify({ status: "incomplete", admin: { email: adminEmail, password: adminPassword } }), { flag: "wx", mode: 0o600 });
    // prepare creates an UNVERIFIED, non-admin identity, via the migration owner.
    execFileSync(process.execPath, ["scripts/bootstrap-admin.mjs", "--prepare", "--email", adminEmail], { stdio: "pipe" });
    const admin = await db.authUser.findUniqueOrThrow({ where: { email: adminEmail } });
    expect(admin.emailVerified).toBe(false);
    expect((await db.profile.findUniqueOrThrow({ where: { id: admin.id } })).isAdmin).toBe(false);
    await auth.requestAuthLink(adminEmail, "setup", "/dashboard", headers);
    const adminLink = mail.findLast((item) => item.email === adminEmail)?.link;
    if (!adminLink) throw new Error("Local admin mailbox proof not captured");
    const adminToken = new URLSearchParams(new URL(adminLink).hash.slice(1)).get("token");
    if (!adminToken) throw new Error("Local admin mailbox proof missing");
    await auth.resetCredential(adminToken, adminPassword, headers);
    // No admin grant via runtime. The existing one-time operator bootstrap checks
    // verified mailbox, matching UUID, no prior admin and migration-owner rights.
    execFileSync(process.execPath, ["scripts/bootstrap-admin.mjs", "--email", adminEmail,
      "--confirm-user", admin.id, "--ack", "ONE_TIME_ADMIN_BOOTSTRAP"], { stdio: "pipe" });
    expect((await db.profile.findUniqueOrThrow({ where: { id: admin.id } })).isAdmin).toBe(true);

    // Existing paid-session fixture path: mocked Stripe line items, no network or
    // actual charge. This provisions a project, order, entitlement and membership.
    const paid = await fulfillCheckoutSession({ id: "cs_local_" + randomUUID(), payment_status: "paid",
      customer_details: { email: customerEmail, name: "Local Test Customer" }, amount_total: 4900,
      currency: "gbp", payment_intent: "pi_local_" + randomUUID() } as never);
    const customer = await ensureAccessProvisioning(paid.clientId, customerEmail);
    expect(customer.needsSetup).toBe(true);
    expect((await db.profile.findUniqueOrThrow({ where: { id: customer.userId } })).isAdmin).toBe(false);
    expect(await db.clientMembership.count({ where: { clientId: paid.clientId, userId: customer.userId } })).toBe(1);
    expect(await db.projectEntitlement.count({ where: { projectId: paid.projectId } })).toBe(2);
    await auth.requestAuthLink(customerEmail, "setup", "/dashboard", headers);
    const customerLink = mail.findLast((item) => item.email === customerEmail)?.link;
    if (!customerLink || new URL(customerLink).pathname !== "/set-password") throw new Error("Local customer setup proof not captured");
    const tempFile = file + ".new";
    await writeFile(tempFile, JSON.stringify({ status: "ready", admin: { email: adminEmail, password: adminPassword },
      customer: { email: customerEmail, setupLink: customerLink, projectId: paid.projectId } }), { flag: "wx", mode: 0o600 });
    await rename(tempFile, file);
    if (((await stat(file)).mode & 0o777) !== 0o600) throw new Error("Private credential file required");
  });
});
