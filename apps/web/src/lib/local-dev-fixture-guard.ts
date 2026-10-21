import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import pg from "pg";

/**
 * Fail-closed proof that this process is pointed at the owner's disposable
 * local cluster and nothing else, for the manual local fixtures only. It is
 * NOT application code and must never be imported by anything that ships.
 *
 * Call it before any fixture import, Prisma write or mocked mailbox proof. URL
 * equivalence alone is insufficient: it also authenticates over the private
 * Unix socket and verifies the actual running data_directory and loopback
 * listener, so a URL that merely looks local cannot stand in for the cluster
 * the owner created.
 */
export async function requirePrivateLocalCluster(): Promise<void> {
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
      ![c.ownerPassword, c.migrationPassword, c.runtimePassword].every((pw: string) => /^[a-f0-9]{48}$/.test(pw)) ||
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

/**
 * The private owner-supplied local addresses. Returned, never logged: the two
 * addresses are the owner's personal mailboxes.
 */
export async function readPrivateLocalIdentities(): Promise<{ adminEmail: string; customerEmail: string }> {
  const identities = JSON.parse(await readFile(process.env.LOCAL_DEV_IDENTITIES_FILE!, "utf8"));
  const { adminEmail, customerEmail } = identities;
  if (![adminEmail, customerEmail].every((email: unknown) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email === email.toLowerCase()) ||
      adminEmail === customerEmail) throw new Error("Two distinct local test identities required");
  return { adminEmail, customerEmail };
}
