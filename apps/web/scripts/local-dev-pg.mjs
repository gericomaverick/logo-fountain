#!/usr/bin/env node
// Manual-only persistent localhost PG. No existing URL, .env file, live provider,
// destructive operation or credential is accepted from the caller environment.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
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
async function safeHome() {
  if (await isAbsent(home)) fail("Local data directory absent: run init explicitly first");
  if (!(await lstat(home)).isDirectory() || (await lstat(home)).mode & 0o077) fail("Local data directory must be a private non-symlink directory");
  if ((await lstat(data)).isSymbolicLink()) fail("Symlinked PG data refused");
  const m = JSON.parse(await readFile(marker, "utf8"));
  if (m.kind !== kind || m.port !== port || m.data !== data) fail("Unowned local database directory refused");
  const c = JSON.parse(await readFile(configFile, "utf8"));
  if ((await lstat(configFile)).mode & 0o077 || (await lstat(configFile)).isSymbolicLink()) fail("Private local config required");
  if (!/^[a-f0-9]{48}$/.test(c.password) || !/^[a-f0-9]{64}$/.test(c.secret)) fail("Corrupt local config");
  return c;
}
function binary(name) { if (!bin || !share || !bin.startsWith("/") || !share.startsWith("/")) fail("Set explicit POSTGRES_TEST_BIN and POSTGRES_TEST_SHARE paths to user-local PostgreSQL binaries"); return join(bin, name); }
function run(cmd, args, env = pgEnv) {
  const out = spawnSync(cmd, args, { cwd: process.cwd(), env, encoding: "utf8", timeout: 120000 });
  if (out.error || out.status !== 0) fail("Local command failed; inspect bin/share, port, PG permissions and directory (output suppressed to protect credentials)");
}
function urls(c) {
  const url = (role, db = "lf_local_dev") => `postgresql://${role}:${c.password}@127.0.0.1:${port}/${db}`;
  return { runtime: url("lf_runtime"), migration: url("lf_migration"), owner: url("cluster_owner", "postgres") };
}
function runtimeEnv(c, extras = {}) {
  return { ...pgEnv, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: urls(c).runtime,
    BETTER_AUTH_SECRET: c.secret, PUBLIC_SITE_URL: site, STRIPE_SECRET_KEY: "sk_test_local_placeholder_only", ...extras };
}
function isRunning() { return spawnSync(binary("pg_ctl"), ["-D", data, "status"], { env: pgEnv, stdio: "ignore" }).status === 0; }
async function verifyOwnedCluster(c) {
  if (!isRunning()) fail("Owned local cluster is stopped: run start first");
  const client = new pg.Client({ connectionString: urls(c).owner });
  try {
    await client.connect();
    const result = await client.query("SELECT current_setting('data_directory') AS dir, inet_server_addr()::text AS host, inet_server_port() AS port");
    if (resolve(result.rows[0].dir) !== data || !["127.0.0.1", "127.0.0.1/32"].includes(result.rows[0].host) || result.rows[0].port !== port) fail("Database is not the owned local PG cluster");
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
  const c = { password: randomBytes(24).toString("hex"), secret: randomBytes(32).toString("hex") };
  await writeFile(configFile, JSON.stringify(c), { flag: "wx", mode: 0o600 });
  const pwfile = join(home, "initdb-password");
  await writeFile(pwfile, c.password, { flag: "wx", mode: 0o600 });
  try { run(binary("initdb"), ["-D", data, "-L", share, "-U", "cluster_owner", "--pwfile", pwfile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"]); }
  finally { await rm(pwfile, { force: true }); }
  run(binary("pg_ctl"), ["-D", data, "-l", join(home, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${home}`, "-w", "start"]);
  const owner = new pg.Client({ connectionString: urls(c).owner });
  try {
    await owner.connect();
    // Random hex password and fixed identifiers only; distinct migration/runtime roles.
    await owner.query(`CREATE ROLE lf_migration LOGIN PASSWORD '${c.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`);
    await owner.query(`CREATE ROLE lf_runtime LOGIN PASSWORD '${c.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`);
    await owner.query("CREATE DATABASE lf_local_dev OWNER lf_migration");
    await owner.query("REVOKE ALL ON DATABASE lf_local_dev FROM PUBLIC");
    await owner.query("GRANT CONNECT ON DATABASE lf_local_dev TO lf_runtime");
  } finally { await owner.end(); }
  await writeFile(marker, JSON.stringify({ kind, port, data }), { flag: "wx", mode: 0o600 });
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
  const env = runtimeEnv(c, { DATABASE_URL: urls(c).runtime, DIRECT_URL: urls(c).migration, PG_INTEGRATION_URL: urls(c).runtime,
    PG_LOCAL_DEV_SEED: "1", LOCAL_DEV_HOME: home, LOCAL_DEV_SECRETS_FILE: secretFile });
  run("./node_modules/.bin/prisma", ["migrate", "deploy"], env);
  const migration = new pg.Client({ connectionString: urls(c).migration });
  try { await migration.connect(); await migration.query(await readFile("ops/postgres/runtime-grants.sql", "utf8")); }
  finally { await migration.end().catch(() => {}); }
  run("./node_modules/.bin/vitest", ["run", "src/lib/local-dev-seed.test.ts"], env);
  console.log(`Seeded locally only. Private setup details: ${secretFile} (mode 0600); never paste its contents into chat or logs.`);
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
  console.log(`Local app: ${site}/login (localhost only; Postmark OFF; Stripe placeholder; R2 ${process.argv.includes("--with-r2") ? "test-only ON" : "OFF"}).`);
  // No DIRECT_URL or provider credentials inherited from the invoking shell.
  // No Next request/exception output in terminals or files: sensitive request
  // details must not become diagnostics. Ctrl-C stops only this app, not PG.
  const server = spawnSync("./node_modules/.bin/next", ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", "45231"],
    { cwd: process.cwd(), env: runtimeEnv(c, extras), stdio: "ignore" });
  if (server.signal && ["SIGINT", "SIGTERM"].includes(server.signal)) console.log("Local app stopped; persistent PG data retained.");
  else if (server.status !== 0) fail("Local app failed to start (server output suppressed to avoid leaking bearer links)");
}
try {
  if (!["init", "start", "stop", "seed", "app", "reset"].includes(command) ||
      (command === "reset" ? process.argv.length !== 4 || process.argv[3] !== "--confirm-disposable-local-data" :
        command === "app" ? process.argv.length > 4 || (process.argv.length === 4 && process.argv[3] !== "--with-r2") : process.argv.length !== 3)) {
    fail("Usage: node scripts/local-dev-pg.mjs init|start|stop|seed|app [--with-r2]|reset --confirm-disposable-local-data");
  }
  if (command === "init") await init();
  else {
    const c = await safeHome();
    if (command === "start") await start(c);
    if (command === "stop") {
      if (isRunning()) { await verifyOwnedCluster(c); run(binary("pg_ctl"), ["-D", data, "-w", "-m", "fast", "stop"]); }
      console.log("Owned local PG stopped; all data retained.");
    }
    if (command === "seed") await seed(c);
    if (command === "app") await app(c);
    if (command === "reset") {
      if (!process.argv.includes("--confirm-disposable-local-data")) fail("Explicit --confirm-disposable-local-data required");
      if (isRunning()) fail("Stop owned PG first; reset never stops a running database");
      await rm(home, { recursive: true, force: false });
      console.log("Only the explicitly owned local PG directory was removed.");
    }
  }
} catch {
  console.error("Local PG command refused/failed (details suppressed to protect private connection values). Check local-dev runbook and owned data directory.");
  process.exitCode = 1;
}
