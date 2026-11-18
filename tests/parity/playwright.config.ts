import { defineConfig, devices } from "@playwright/test";
import { resolveBaseUrl, resolveTarget } from "./adapters/target";

const target = resolveTarget();
const baseURL = resolveBaseUrl(target);
const port = new URL(baseURL).port || "80";

// The suite normally drives an app that is already running at PARITY_BASE_URL.
// PARITY_START_NEXT=1 starts the Next.js dev server for local convenience.
const startNext = target === "next" && process.env.PARITY_START_NEXT === "1";

// Next.js 16.4 refuses to start when it detects an AI coding agent (CLAUDECODE etc.) and prints an
// "upgrade" nudge instead. CI has no such variables; strip them so local agent runs behave like CI.
// The two moderate advisories it nudges about (GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8) need
// 'use cache'/unstable_cache, which apps/web doesn't use (RISKS.md 2026-11-18).
const AGENT_ENV = new Set(["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "AI_AGENT"]);
const serverEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && !AGENT_ENV.has(entry[0])),
);

export default defineConfig({
  testDir: process.env.PARITY_SELFTEST === "1" ? "./selftest" : "./journeys",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  metadata: { target, baseURL },
  webServer: startNext
    ? {
        command: `npx next dev --hostname 127.0.0.1 --port ${port}`,
        cwd: "../../apps/web",
        env: serverEnv,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      }
    : undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
