// Seeding and the ONE cross-process database lock of the parity suite (story 0.8a).
// Seeding: fixtures/scenarios/<name>.json into the target app's database. Next: apps/web/scripts/parity-seed.mjs
// (story 0.4). Laravel: php artisan parity:seed (story 2.6).
//
// Every seed truncates the shared parity database, and `fullyParallel` runs files in several workers. So every
// test that touches the database holds a lease on it (a readers-writer lock across worker processes):
//   exclusive          the test (or file) may seed and reseed at will; nobody else touches the DB meanwhile.
//   shared(scenario)   the DB holds `scenario` as a common baseline; holders only ADD data (fresh emails, fresh
//                      Stripe sessions) and run in parallel with each other. The first holder seeds the baseline.
// Usually you don't call these functions: declare the mode with `test.use({ db: ... })` (fixtures.ts), and the
// auto fixture there takes and releases the lease. `seed()` refuses to run without an exclusive lease.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { resolveTarget } from "./target";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export type Scenario = {
  name: string;
  users: Array<{ key: string; email: string; password: string | null; admin: boolean; firstName?: string; lastName?: string }>;
  projects: Array<{ key: string; status: string; package: string; [k: string]: unknown }>;
};

export function loadScenario(name: string): Scenario {
  return JSON.parse(readFileSync(join(root, "fixtures/scenarios", `${name}.json`), "utf8"));
}

/** Deterministic ID shared by both seeders: sha256("<scenario>:<kind>:<key>") shaped as a UUID. */
export function scenarioId(scenario: string, kind: string, key: string): string {
  const h = createHash("sha256").update(`${scenario}:${kind}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Loads `name` into the target's database. Needs the exclusive lease (see the header). */
export function seed(name: string): Scenario {
  if (lease?.mode !== "exclusive") {
    throw new Error(`seed("${name}") needs the exclusive DB lease: use test.use({ db: "exclusive" }) or useScenario() (or acquireExclusive() in beforeAll)`);
  }
  runSeeder(name);
  return loadScenario(name);
}

function runSeeder(name: string) {
  trace(`seed ${name}`);
  if (resolveTarget() === "next") {
    execFileSync(process.execPath, [join(root, "../../apps/web/scripts/parity-seed.mjs"), name], {
      env: { ...process.env, PARITY_MODE: "1" },
      stdio: "pipe",
    });
  } else {
    execFileSync("php", ["artisan", "parity:seed", name], { cwd: join(root, "../../apps/portal"), env: process.env, stdio: "pipe" });
  }
}

// ---------------------------------------------------------------------------------------------
// The lock. One directory per database (PARITY_DATABASE_URL), shared by every worker and every run on it:
//   writer/pid       exists while an exclusive lease is held (mkdir is atomic)
//   readers/<pid>-x  one file per shared lease
//   baseline         the scenario the shared holders are using; removed whenever a writer takes over
// Holders that died (pid gone) are cleaned up by whoever is waiting on them.

/** Per-database directory for cross-process coordination files (also used by adapters/stripe.ts). */
export const coordinationDir = join(tmpdir(), `lf-parity-db-${createHash("sha256").update(process.env.PARITY_DATABASE_URL ?? "default").digest("hex").slice(0, 16)}`);
const writerDir = join(coordinationDir, "writer");
const readersDir = join(coordinationDir, "readers");
const baselineFile = join(coordinationDir, "baseline");
// Waiters are served first-come-first-served (queue below), so a wait is bounded by the exclusive work queued
// ahead of it. The timeout only catches a genuinely stuck holder; override with PARITY_LOCK_TIMEOUT_MS.
const LOCK_TIMEOUT_MS = Number(process.env.PARITY_LOCK_TIMEOUT_MS) || 30 * 60_000;
const queueDir = join(coordinationDir, "queue");

type Lease = { mode: "exclusive"; scope: string } | { mode: "shared"; scope: string; scenario: string; readerFile: string };
let lease: Lease | null = null;
let epoch = 0;
/** PARITY_LOCK_LOG=<file> appends every lease and seed event (debugging lock problems). */
const trace = (event: string) => {
  if (process.env.PARITY_LOCK_LOG) appendFileSync(process.env.PARITY_LOCK_LOG, `${new Date().toISOString()} ${process.pid} ${event}\n`);
};
/** Changes whenever this process takes a new lease: the DB may have been reseeded since, so drop cached sessions. */
export const leaseEpoch = () => epoch;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const pidAlive = (pid: number) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
};
const readText = (file: string) => { try { return readFileSync(file, "utf8"); } catch { return null; } };

/** True while a live writer holds the lock; removes a dead writer's directory. */
function writerActive(): boolean {
  const pidText = readText(join(writerDir, "pid"));
  if (pidText === null || !(Number(pidText) > 0)) {
    let ageMs: number;
    try { ageMs = Date.now() - statSync(writerDir).mtimeMs; } catch { return false; } // no writer
    if (ageMs < 10_000) return true; // created, pid not written yet
  } else if (pidAlive(Number(pidText))) {
    return true;
  }
  // Dead holder. Re-check just before removing so a fresh writer isn't swept away (small window, crash-only path).
  if (readText(join(writerDir, "pid")) === pidText) rmSync(writerDir, { recursive: true, force: true });
  return false;
}

function liveReaders(): string[] {
  let names: string[] = [];
  try { names = readdirSync(readersDir); } catch { return []; }
  return names.filter((name) => {
    if (pidAlive(Number(name.split("-")[0]))) return true;
    rmSync(join(readersDir, name), { force: true });
    return false;
  });
}

/** Live writer tickets, oldest first; removes tickets whose process died. */
function liveTickets(): string[] {
  let names: string[] = [];
  try { names = readdirSync(queueDir); } catch { return []; }
  return names.filter((name) => {
    if (pidAlive(Number(name.split("-")[1]))) return true;
    rmSync(join(queueDir, name), { force: true });
    return false;
  }).sort();
}

async function takeWriter(deadline: number) {
  mkdirSync(queueDir, { recursive: true });
  // Ticket: zero-padded wall-clock ms (comparable across processes), then pid as tie-break, so lexical order is
  // arrival order (story 0.9 fairness fix).
  const ticketName = `${String(Date.now()).padStart(15, "0")}-${process.pid}-${randomBytes(4).toString("hex")}`;
  const ticket = join(queueDir, ticketName);
  writeFileSync(ticket, "");
  try {
    await takeWriterInTurn(ticketName, deadline);
  } finally {
    rmSync(ticket, { force: true });
  }
}

async function takeWriterInTurn(ticketName: string, deadline: number) {
  for (;;) {
    if (liveTickets()[0] !== ticketName) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for the DB lock queue (${queueDir})`);
      await sleep(100);
      continue;
    }
    try {
      mkdirSync(writerDir);
      // Atomic: a reader never sees a half-written (empty) pid and mistakes it for a dead holder.
      const tmp = join(coordinationDir, `pid-${process.pid}-${randomBytes(4).toString("hex")}`);
      writeFileSync(tmp, String(process.pid));
      renameSync(tmp, join(writerDir, "pid"));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!writerActive()) continue;
      if (Date.now() > deadline) throw new Error(`timed out waiting for the DB lock (${writerDir})`);
      await sleep(100);
    }
  }
  // Writer preference: new readers now wait; drain the ones already in.
  while (liveReaders().length > 0) {
    if (Date.now() > deadline) { rmSync(writerDir, { recursive: true, force: true }); throw new Error("timed out waiting for shared DB holders to finish"); }
    await sleep(100);
  }
  rmSync(baselineFile, { force: true });
}

function dropWriter() {
  if (readText(join(writerDir, "pid")) === String(process.pid)) rmSync(writerDir, { recursive: true, force: true });
}

function addReader(): string {
  mkdirSync(readersDir, { recursive: true });
  const file = join(readersDir, `${process.pid}-${randomBytes(4).toString("hex")}`);
  writeFileSync(file, "");
  return file;
}

/** Releases whatever lease this process holds (no-op if none). */
export function releaseDb(): void {
  const held = lease;
  lease = null;
  if (!held) return;
  trace(`release ${held.mode} ${held.scope}`);
  if (held.mode === "exclusive") dropWriter();
  else rmSync(held.readerFile, { force: true });
}

/** The scope of the lease this process holds: "test", a spec file path, or null. */
export const leaseScope = (): string | null => lease?.scope ?? null;

/** Drops a lease that belongs to another spec file (a file-scoped lease outlives its file until this is called). */
export function releaseIfNotFor(file: string): void {
  if (lease && lease.scope !== "test" && lease.scope !== file) releaseDb();
}

/**
 * Exclusive lease: nobody else uses the DB until releaseDb(). `scope` is "test" (released by the fixture after the
 * test) or a spec file path (held across that file's tests, e.g. from beforeAll). Re-entrant within a process.
 */
export async function acquireExclusive(scope = "test", timeoutMs = LOCK_TIMEOUT_MS): Promise<void> {
  if (lease?.mode === "exclusive") {
    if (lease.scope === "test" && scope !== "test") lease.scope = scope; // widen
    return;
  }
  releaseDb(); // a shared lease is given up, never upgraded in place (that could deadlock two upgraders)
  await takeWriter(Date.now() + timeoutMs);
  lease = { mode: "exclusive", scope }; epoch++; trace(`exclusive ${scope}`);
}

/**
 * Shared lease on `scenario` as a baseline. If the DB doesn't hold it, this process briefly takes the exclusive
 * lease, seeds it, and downgrades. Holders must only add data that no other holder can collide with.
 */
export async function acquireShared(scenario: string, scope: string, timeoutMs = LOCK_TIMEOUT_MS): Promise<void> {
  if (lease?.mode === "shared" && lease.scenario === scenario) { lease.scope = scope; return; }
  if (lease?.mode === "exclusive" && lease.scope === scope) throw new Error(`${scope} already holds the exclusive DB lease; it can't also share "${scenario}"`);
  releaseDb();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    while (writerActive()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for the DB lock (${writerDir})`);
      await sleep(100);
    }
    const readerFile = addReader();
    if (writerActive()) { rmSync(readerFile, { force: true }); continue; }
    if (readText(baselineFile) === scenario) { lease = { mode: "shared", scope, scenario, readerFile }; epoch++; trace(`shared ${scenario} ${scope}`); return; }
    // Wrong (or no) baseline: reseed it under the exclusive lease, then downgrade.
    rmSync(readerFile, { force: true });
    await takeWriter(deadline);
    try {
      runSeeder(scenario);
      writeFileSync(baselineFile, scenario);
      lease = { mode: "shared", scope, scenario, readerFile: addReader() }; epoch++; trace(`shared(seeded) ${scenario} ${scope}`);
    } finally {
      dropWriter();
    }
    return;
  }
}

/**
 * For beforeAll hooks: a lease for the whole current spec file. The fixture in fixtures.ts drops it when the
 * worker moves on to another file (or exits); releaseDb() in afterAll hands it back sooner.
 */
export async function lockDbForFile(mode: "exclusive" | { shared: string }): Promise<void> {
  const file = test.info().file;
  if (mode === "exclusive") await acquireExclusive(file);
  else await acquireShared(mode.shared, file);
}
