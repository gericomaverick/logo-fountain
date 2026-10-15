#!/usr/bin/env node
// Manual-only persistent localhost PG. No existing URL, .env file, live provider,
// destructive operation or credential is accepted from the caller environment.
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { access, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import pg from "pg";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const home = resolve(homedir(), ".local/share/logo-fountain/dev-pg-5649");
const data = join(home, "data");
const marker = join(home, "marker.json");
const configFile = join(home, "config.json");
const secretFile = join(home, "local-credentials.json");
const providerFile = join(home, "r2-test.json");
const stripeFile = join(home, "stripe-test.json");
const identitiesFile = join(home, "local-identities.json");
const kind = "logo-fountain-private-local-pg-5649";
const port = 45232;
const site = "http://127.0.0.1:45231";
const command = process.argv[2];
const bin = process.env.POSTGRES_TEST_BIN;
const share = process.env.POSTGRES_TEST_SHARE;
const pgEnv = { PATH: process.env.PATH, HOME: homedir(), ...(process.env.POSTGRES_TEST_LIB ? { LD_LIBRARY_PATH: process.env.POSTGRES_TEST_LIB } : {}) };
const fail = (message) => { throw new Error(message); };
async function isAbsent(path) { try { await access(path); return false; } catch (error) { if (error.code !== "ENOENT") throw error; return true; } }
async function safeNoEnvFiles() {
  // Next and Prisma autoload these independently of the sanitized child env.
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local", ".env.production", ".env.production.local"]) {
    if (!(await isAbsent(file))) fail("Local helper refuses app env files; use only its private owned configuration");
  }
}
async function ownedMarker() {
  if (await isAbsent(home)) fail("Local data directory absent: run init explicitly first");
  const dir = await lstat(home);
  if (!dir.isDirectory() || dir.mode & 0o077) fail("Private non-symlink directory required");
  const st = await lstat(marker);
  if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077) fail("Private ownership marker required");
  const m = JSON.parse(await readFile(marker, "utf8"));
  if (m.kind !== kind || m.port !== port || m.data !== data) fail("Unowned local database directory refused");
  if (!(await isAbsent(data)) && (await lstat(data)).isSymbolicLink()) fail("Symlinked PG data refused");
  return m;
}
async function safeHome() {
  await ownedMarker();
  const st = await lstat(configFile);
  if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077) fail("Private local config required");
  const c = JSON.parse(await readFile(configFile, "utf8"));
  if (![c.ownerPassword, c.migrationPassword, c.runtimePassword].every((pw) => /^[a-f0-9]{48}$/.test(pw)) ||
      new Set([c.ownerPassword, c.migrationPassword, c.runtimePassword]).size !== 3 || !/^[a-f0-9]{64}$/.test(c.secret)) fail("Corrupt local config");
  return c;
}
function binary(name) { if (!bin || !share || !bin.startsWith("/") || !share.startsWith("/")) fail("Set explicit POSTGRES_TEST_BIN and POSTGRES_TEST_SHARE paths to user-local PostgreSQL binaries"); return join(bin, name); }
function run(cmd, args, env = pgEnv) {
  const out = spawnSync(cmd, args, { cwd: process.cwd(), env, encoding: "utf8", timeout: 120000 });
  if (out.error || out.status !== 0) fail("Local command failed; inspect bin/share, port, PG permissions and directory (output suppressed to protect credentials)");
}
function urls(c) {
  const url = (role, password, db = "lf_local_dev") => `postgresql://${role}:${password}@127.0.0.1:${port}/${db}`;
  return { runtime: url("lf_runtime", c.runtimePassword), migration: url("lf_migration", c.migrationPassword), owner: url("cluster_owner", c.ownerPassword, "postgres") };
}
function runtimeEnv(c, extras = {}) {
  return { ...pgEnv, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: urls(c).runtime,
    BETTER_AUTH_SECRET: c.secret, PUBLIC_SITE_URL: site, STRIPE_SECRET_KEY: "sk_test_local_placeholder_only", ...extras };
}
function isRunning() {
  // pg_ctl is only consulted for our marker-bound data directory.
  return spawnSync(binary("pg_ctl"), ["-D", data, "status"], { env: pgEnv, stdio: "ignore" }).status === 0;
}
async function verifiedPid() {
  if (await isAbsent(data)) return false;
  if (await isAbsent(join(data, "postmaster.pid"))) return false;
  const lines = (await readFile(join(data, "postmaster.pid"), "utf8")).split("\n");
  if (resolve(lines[1] || "/") !== data || lines[3] !== String(port) || lines[4] !== home || !/^[1-9][0-9]*$/.test(lines[0])) fail("Unrecognized cluster PID file");
  try { process.kill(Number(lines[0]), 0); } catch (error) { if (error.code === "ESRCH") return false; throw error; }
  // Linux /proc identifies the actual process, not just a possibly reused PID.
  const args = (await readFile(`/proc/${lines[0]}/cmdline`, "utf8")).split("\0");
  if (!/(^|\/)postgres$/.test(args[0]) || args[args.indexOf("-D") + 1] !== data) fail("PID is not our cluster postmaster");
  return true;
}
async function verifyOwnedCluster(c) {
  if (!isRunning()) fail("Owned local cluster is stopped: run start first");
  // Private Unix socket, not an unverified TCP listener asking for owner secret.
  const client = new pg.Client({ host: home, port, user: "cluster_owner", password: c.ownerPassword, database: "postgres" });
  try {
    await client.connect();
    const result = await client.query("SELECT current_setting('data_directory') AS dir, current_setting('listen_addresses') AS listen, current_setting('port')::int AS port");
    if (resolve(result.rows[0].dir) !== data || result.rows[0].listen !== "127.0.0.1" || result.rows[0].port !== port) fail("Database is not the owned local PG cluster");
  } finally { await client.end().catch(() => {}); }
}
async function init() {
  if (process.getuid?.() === 0) fail("Refuse to run local PostgreSQL as root");
  if (!(await isAbsent(home))) fail("Existing local data found; init never overwrites it");
  await safeNoEnvFiles();
  binary("initdb"); binary("pg_ctl");
  const reserve = createServer();
  await new Promise((yes, no) => { reserve.once("error", no); reserve.listen(port, "127.0.0.1", yes); });
  await new Promise((yes) => reserve.close(yes));
  await mkdir(resolve(home, ".."), { recursive: true });
  await mkdir(home, { mode: 0o700 }); // exclusive: never reuse unknown local files
  // Marker FIRST: if any later step fails, stop/reset can still identify this
  // specific scratch-owned directory; reset remains explicit and never automatic.
  await writeFile(marker, JSON.stringify({ kind, port, data }), { flag: "wx", mode: 0o600 });
  const c = { ownerPassword: randomBytes(24).toString("hex"), migrationPassword: randomBytes(24).toString("hex"),
    runtimePassword: randomBytes(24).toString("hex"), secret: randomBytes(32).toString("hex") };
  await writeFile(configFile, JSON.stringify(c), { flag: "wx", mode: 0o600 });
  const pwfile = join(home, "initdb-password");
  await writeFile(pwfile, c.ownerPassword, { flag: "wx", mode: 0o600 });
  try { run(binary("initdb"), ["-D", data, "-L", share, "-U", "cluster_owner", "--pwfile", pwfile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"]); }
  finally { await rm(pwfile, { force: true }); }
  run(binary("pg_ctl"), ["-D", data, "-l", join(home, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${home}`, "-w", "start"]);
  const owner = new pg.Client({ host: home, port, user: "cluster_owner", password: c.ownerPassword, database: "postgres" });
  try {
    await owner.connect();
    // Random hex password and fixed identifiers only; distinct migration/runtime roles.
    await owner.query(`CREATE ROLE lf_migration LOGIN PASSWORD '${c.migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`);
    await owner.query(`CREATE ROLE lf_runtime LOGIN PASSWORD '${c.runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`);
    await owner.query("CREATE DATABASE lf_local_dev OWNER lf_migration");
    await owner.query("REVOKE ALL ON DATABASE lf_local_dev FROM PUBLIC");
    await owner.query("GRANT CONNECT ON DATABASE lf_local_dev TO lf_runtime");
  } finally { await owner.end(); }
  console.log("Owned persistent local PG initialized and running on 127.0.0.1:45232 (empty DB). No accounts seeded.");
}
async function start(c) {
  if (!isRunning()) run(binary("pg_ctl"), ["-D", data, "-l", join(home, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${home}`, "-w", "start"]);
  await verifyOwnedCluster(c);
  console.log("Owned persistent local PG running on 127.0.0.1:45232; existing data preserved.");
}
async function seed(c) {
  if (!(await isAbsent(secretFile))) fail("Local identities already seeded; refusing to replace setup link/credentials");
  await safeNoEnvFiles();
  await verifyOwnedCluster(c);
  const st = await lstat(identitiesFile);
  if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077) fail("Private owner-supplied identities file required");
  const identities = JSON.parse(await readFile(identitiesFile, "utf8"));
  if (![identities.adminEmail, identities.customerEmail].every((email) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email === email.toLowerCase()) ||
      identities.adminEmail === identities.customerEmail) fail("Two distinct normalized owner-supplied local emails required");
  const env = runtimeEnv(c, { DATABASE_URL: urls(c).runtime, DIRECT_URL: urls(c).migration, PG_INTEGRATION_URL: urls(c).runtime,
    PG_LOCAL_DEV_SEED: "1", LOCAL_DEV_HOME: home, LOCAL_DEV_SECRETS_FILE: secretFile, LOCAL_DEV_IDENTITIES_FILE: identitiesFile });
  run("./node_modules/.bin/prisma", ["migrate", "deploy"], env);
  const migration = new pg.Client({ connectionString: urls(c).migration });
  try { await migration.connect(); await migration.query(await readFile("ops/postgres/runtime-grants.sql", "utf8")); }
  finally { await migration.end().catch(() => {}); }
  run("./node_modules/.bin/vitest", ["run", "src/lib/local-dev-seed.test.ts"], env);
  console.log(`Seeded locally only. Private setup details: ${secretFile} (mode 0600); never paste its contents into chat or logs.`);
}
/** `app` takes each of its two opt-in flags at most once, and nothing else. */
function appFlagsValid(flags) {
  return flags.every((flag) => flag === "--with-r2" || flag === "--with-stripe") && new Set(flags).size === flags.length;
}
async function app(c) {
  await verifyOwnedCluster(c);
  await safeNoEnvFiles();
  const extras = {};
  if (process.argv.includes("--with-r2")) {
    const st = await lstat(providerFile);
    if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077) fail("R2 settings must be a private regular file (mode 0600)");
    const settings = JSON.parse(await readFile(providerFile, "utf8"));
    for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_CONCEPTS_BUCKET", "R2_FINAL_DELIVERABLES_BUCKET", "R2_JURISDICTION"]) {
      if (settings[key]) extras[key] = settings[key];
    }
    if (!["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_CONCEPTS_BUCKET", "R2_FINAL_DELIVERABLES_BUCKET"].every((key) => extras[key])) fail("Incomplete R2 test settings");
    if (![extras.R2_CONCEPTS_BUCKET, extras.R2_FINAL_DELIVERABLES_BUCKET].every((bucket) => /^lf-5649-test-[a-z0-9-]+$/.test(bucket)) ||
        extras.R2_CONCEPTS_BUCKET === extras.R2_FINAL_DELIVERABLES_BUCKET) fail("Only two distinct lf-5649-test-* buckets are accepted");
  }
  if (process.argv.includes("--with-stripe")) {
    // Test mode only: a live key is refused, never loaded. The webhook secret is
    // the one `stripe listen` prints for forwarding to this local server.
    const st = await lstat(stripeFile);
    if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077) fail("Stripe settings must be a private regular file (mode 0600)");
    const settings = JSON.parse(await readFile(stripeFile, "utf8"));
    if (!/^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(settings.STRIPE_SECRET_KEY ?? "")) fail("STRIPE_SECRET_KEY must be a test-mode key");
    if (!/^whsec_[A-Za-z0-9]+$/.test(settings.STRIPE_WEBHOOK_SECRET ?? "")) fail("STRIPE_WEBHOOK_SECRET must be a webhook signing secret");
    extras.STRIPE_SECRET_KEY = settings.STRIPE_SECRET_KEY;
    extras.STRIPE_WEBHOOK_SECRET = settings.STRIPE_WEBHOOK_SECRET;
  }
  // Never accidentally connect a tester to a stale/wrong dev server.
  const reserve = createServer();
  await new Promise((yes, no) => { reserve.once("error", no); reserve.listen(45231, "127.0.0.1", yes); });
  await new Promise((yes) => reserve.close(yes));
  console.log(`Local app: ${site}/login (localhost only; Postmark OFF; Stripe ${process.argv.includes("--with-stripe") ? "test mode ON" : "placeholder"}; R2 ${process.argv.includes("--with-r2") ? "test-only ON" : "OFF"}).`);
  // Separate process group so SIGINT/SIGTERM stops both Next CLI and its
  // worker; do not emit request/exception output containing bearer links.
  const server = spawn("./node_modules/.bin/next", ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", "45231"],
    { cwd: process.cwd(), env: runtimeEnv(c, extras), stdio: "ignore", detached: true });
  const terminate = () => { try { process.kill(-server.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; } };
  process.once("SIGINT", terminate);
  process.once("SIGTERM", terminate);
  const outcome = await new Promise((yes, no) => { server.once("error", no); server.once("exit", (code, signal) => yes({ code, signal })); });
  terminate(); // also reap a worker if the CLI itself exited first
  process.removeListener("SIGINT", terminate);
  process.removeListener("SIGTERM", terminate);
  if (outcome.signal && ["SIGINT", "SIGTERM"].includes(outcome.signal)) console.log("Local app stopped; persistent PG data retained.");
  else if (outcome.code !== 0) fail("Local app failed to start (server output suppressed to avoid leaking bearer links)");
}
try {
  if (!["init", "start", "stop", "seed", "app", "reset"].includes(command) ||
      (command === "reset" ? process.argv.length !== 4 || process.argv[3] !== "--confirm-disposable-local-data" :
        command === "app" ? !appFlagsValid(process.argv.slice(3)) : process.argv.length !== 3)) {
    fail("Usage: node scripts/local-dev-pg.mjs init|start|stop|seed|app [--with-r2] [--with-stripe]|reset --confirm-disposable-local-data");
  }
  if (command === "init") await init();
  else {
    await ownedMarker();
    const c = ["stop", "reset"].includes(command) ? null : await safeHome();
    if (command === "start") await start(c);
    if (command === "stop") {
      if (isRunning()) {
        if (!(await verifiedPid())) fail("Running cluster lacks verified ownership PID file");
        if (c) await verifyOwnedCluster(c);
        run(binary("pg_ctl"), ["-D", data, "-w", "-m", "fast", "stop"]);
      }
      console.log("Owned local PG stopped; all data retained.");
    }
    if (command === "seed") await seed(c);
    if (command === "app") await app(c);
    if (command === "reset") {
      if (!process.argv.includes("--confirm-disposable-local-data")) fail("Explicit --confirm-disposable-local-data required");
      if (isRunning() || await verifiedPid()) fail("Stop owned PG first; reset never stops a running or uncertain database");
      await rm(home, { recursive: true, force: false });
      console.log("Only the explicitly owned local PG directory was removed.");
    }
  }
} catch {
  console.error("Local PG command refused/failed (details suppressed to protect private connection values). Check local-dev runbook and owned data directory.");
  process.exitCode = 1;
}
