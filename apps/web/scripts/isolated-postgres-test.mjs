// Explicit opt-in, OWNED disposable PostgreSQL cluster only. Never connects to an
// existing DATABASE_URL, never downloads/installs tooling, never starts a service.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm, access, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import pg from "pg";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

const bin = process.env.POSTGRES_TEST_BIN;
const share = process.env.POSTGRES_TEST_SHARE;
if (!bin || !share) throw new Error("Set explicit user-local POSTGRES_TEST_BIN and POSTGRES_TEST_SHARE; no system/live PostgreSQL is used");
if (process.getuid?.() === 0) throw new Error("Do not run disposable PostgreSQL tests as root");
try { await access('.env.local'); throw new Error("Refuse .env.local override during isolated database tests; use a clean isolated worktree"); } catch (e) { if (e.code !== "ENOENT") throw e; }
const work = await mkdtemp(join(tmpdir(), "logo-fountain-owned-pg-"));
const artifact = resolve(process.env.PG_TEST_ARTIFACT_DIR || join(work, "evidence"));
await mkdir(artifact, { recursive: true });
const data = join(work, "cluster");
const password = randomBytes(24).toString("hex");
const pwfile = join(work, "password");
await writeFile(pwfile, password, { mode: 0o600 });
const reservation = createServer();
await new Promise((yes, no) => { reservation.once("error", no); reservation.listen(0, "127.0.0.1", yes); });
const port = reservation.address().port;
await new Promise((yes, no) => reservation.close((e) => e ? no(e) : yes()));
const database = "lf_exit_test";
const makeUrl = (user, db = database) => `postgresql://${user}:${password}@127.0.0.1:${port}/${db}`;
const env = { ...process.env, ...(process.env.POSTGRES_TEST_LIB ? { LD_LIBRARY_PATH: process.env.POSTGRES_TEST_LIB } : {}), DATABASE_URL: makeUrl("lf_runtime"), DIRECT_URL: makeUrl("lf_migration"), PG_INTEGRATION_URL: makeUrl("lf_runtime"), RUN_PG_INTEGRATION: "1" };
function run(command, args, name) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, encoding: "utf8", timeout: 120000 });
  const output = `${result.stdout || ""}\n${result.stderr || ""}\n${result.error ? String(result.error) : ""}`.replaceAll(password, "[redacted]");
  return writeFile(join(artifact, name + ".log"), output).then(() => {
    console.log(`${name}: ${result.status === 0 ? "PASS" : "FAIL"}`);
    if (result.error || result.status !== 0) throw new Error(`${name} failed; see sanitized artifact log`);
  });
}
let started = false;
let initialized = false;
// Signal/abnormal-exit fallback targets ONLY our allocated cluster, never a PID
// inferred from a shared service. Retain its files if normal cleanup is aborted.
process.once("exit", () => {
  if (initialized) spawnSync(join(bin, "pg_ctl"), ["-D", data, "-w", "-m", "fast", "stop"], { env, stdio: "ignore", timeout: 30000 });
});
process.once("SIGINT", () => process.exit(130));
process.once("SIGTERM", () => process.exit(143));
try {
  await run(join(bin, "initdb"), ["-D", data, "-L", share, "-U", "cluster_owner", "--pwfile", pwfile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"], "initdb");
  initialized = true;
  await run(join(bin, "pg_ctl"), ["-D", data, "-l", join(artifact, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${work}`, "-w", "start"], "start");
  started = true;
  const owner = new pg.Client({ connectionString: makeUrl("cluster_owner", "postgres") });
  await owner.connect();
  try {
    // Only alphanumeric random password and fixed identifiers are interpolated.
    await owner.query(`CREATE ROLE lf_migration LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`);
    await owner.query(`CREATE ROLE lf_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`);
    await owner.query(`CREATE DATABASE ${database} OWNER lf_migration`);
    await owner.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    await owner.query(`GRANT CONNECT ON DATABASE ${database} TO lf_runtime`);
  } finally { await owner.end(); }
  await run("./node_modules/.bin/prisma", ["migrate", "deploy"], "migrate");
  const migration = new pg.Client({ connectionString: env.DIRECT_URL });
  await migration.connect();
  try {
    const { readFile } = await import("node:fs/promises");
    await migration.query(await readFile("ops/postgres/runtime-grants.sql", "utf8"));
  } finally { await migration.end(); }
  await run("./node_modules/.bin/prisma", ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], "schema-drift");
  await run("./node_modules/.bin/vitest", ["run", "src/lib/postgres.integration.test.ts"], "postgres-integration");
} finally {
  if (started) await run(join(bin, "pg_ctl"), ["-D", data, "-w", "-m", "fast", "stop"], "stop");
  initialized = false;
  // Only the directory allocated by THIS process is removed. If evidence is
  // inside it, retain it for inspection; otherwise remove the whole test tree.
  if (artifact.startsWith(work + "/")) await rm(data, { recursive: true, force: true });
  else await rm(work, { recursive: true, force: true });
}
