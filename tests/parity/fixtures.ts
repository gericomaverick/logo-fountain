import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";
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

type Fixtures = { target: Target };

export const test = base.extend<Fixtures & { expectedFailureGuard: void }>({
  target: async ({}, use) => {
    await use(resolveTarget());
  },
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
