import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";
import { acquireExclusive, acquireShared, leaseScope, releaseDb, releaseIfNotFor } from "./adapters/seed";
import { resolveTarget, type Target } from "./adapters/target";

const here = dirname(fileURLToPath(import.meta.url));

/** Exact test titles that are expected to FAIL on Next (decided deviations, DV- rows). */
export function loadExpectedNextFailures(file = process.env.PARITY_EXPECTED_FAILURES ?? join(here, "expected-next-failures.txt")): Set<string> {
  return new Set(
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

/**
 * How a test uses the shared parity database (adapters/seed.ts has the lock):
 *   "none"                 default; the test doesn't depend on DB contents
 *   "exclusive"            per test: nobody else touches the DB; call seed() as often as you like
 *   { shared: "<name>" }   per file: the DB holds scenario <name> as a baseline (seeded once, by whoever comes
 *                          first); the test only adds data no one else can collide with (fresh emails/sessions)
 * Set it with `test.use({ db: ... })` at file or describe level.
 */
export type DbMode = "none" | "exclusive" | { shared: string };

type Fixtures = { target: Target; db: DbMode };

export const test = base.extend<Fixtures & { dbLease: void; expectedFailureGuard: void }, { dbWorkerLease: void }>({
  target: async ({}, use) => {
    await use(resolveTarget());
  },
  db: ["none", { option: true }],
  // Takes the lease `db` asks for before the test (and its beforeEach hooks) and releases a per-test lease after
  // it. Shared and beforeAll-taken leases are file-scoped: kept for the file's next test, dropped when this worker
  // moves on to another file (or exits). The wait for the lock doesn't count against the test timeout.
  dbLease: [
    async ({ db }, use, testInfo) => {
      releaseIfNotFor(testInfo.file);
      if (db === "exclusive") await acquireExclusive("test");
      else if (typeof db === "object") await acquireShared(db.shared, testInfo.file);
      await use();
      if (leaseScope() === "test") releaseDb();
    },
    // Waiting for the lease can take as long as the exclusive work queued ahead (FIFO, adapters/seed.ts), so this
    // must exceed the lock timeout, not cut it short (story 0.9: an 11-minute cap starved the tail of the queue).
    { auto: true, timeout: (Number(process.env.PARITY_LOCK_TIMEOUT_MS) || 30 * 60_000) + 60_000 },
  ],
  dbWorkerLease: [
    async ({}, use) => {
      await use();
      releaseDb();
    },
    { scope: "worker", auto: true },
  ],
  // Runs before every test. On Next, a listed test is marked as an expected failure:
  // Playwright then fails the run if that test unexpectedly passes.
  expectedFailureGuard: [
    async ({ target }, use, testInfo) => {
      if (target === "next" && loadExpectedNextFailures().has(testInfo.title)) {
        testInfo.fail(true, "Decided deviation: expected to fail on Next (expected-next-failures.txt)");
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
