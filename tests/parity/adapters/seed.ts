// Loads a named scenario (fixtures/scenarios/<name>.json) into the target app's database.
// Next: apps/web/scripts/parity-seed.mjs (story 0.4). Laravel: php artisan parity:seed (story 2.6).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTarget } from "./target";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export type Scenario = {
  name: string;
  users: Array<{ key: string; email: string; password: string | null; admin: boolean }>;
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

export function seed(name: string): Scenario {
  const target = resolveTarget();
  if (target === "next") {
    execFileSync(process.execPath, [join(root, "../../apps/web/scripts/parity-seed.mjs"), name], {
      env: { ...process.env, PARITY_MODE: "1" },
      stdio: "pipe",
    });
  } else {
    execFileSync("php", ["artisan", "parity:seed", name], { cwd: join(root, "../../apps/portal"), env: process.env, stdio: "pipe" });
  }
  return loadScenario(name);
}
