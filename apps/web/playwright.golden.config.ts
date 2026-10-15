import { defineConfig, devices } from "@playwright/test";

// Driven only by scripts/isolated-postgres-test.mjs (PG_GOLDEN_PATH=1), which owns
// the throwaway database, app server and mailbox fixture. No webServer here.
const baseURL = process.env.GOLDEN_BASE_URL;
if (!baseURL || !process.env.AUTH_BROWSER_FIXTURE) throw new Error("Run through the isolated PostgreSQL runner only");

export default defineConfig({
  testDir: "./e2e-golden",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  use: { baseURL, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
