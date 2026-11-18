#!/usr/bin/env node
// Applies apps/web's Prisma migrations to the parity database (story 0.4, O-09 seam d).
// prisma.config.ts loads .env.local with override, which would replace the parity URLs, so this
// runs Prisma from a temporary copy that contains no .env files (as local-dev-pg-handoff.md advises).
// Usage: PARITY_MODE=1 PARITY_DATABASE_URL=<migrate role URL> PARITY_RUNTIME_DATABASE_URL=<runtime role URL> node scripts/parity-migrate.mjs
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertParityTarget } from "./parity-seed-guard.mjs";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrate = assertParityTarget();
const runtime = process.env.PARITY_RUNTIME_DATABASE_URL;
if (!runtime) throw new Error("PARITY_RUNTIME_DATABASE_URL (runtime role) is required");

const dir = mkdtempSync(join(tmpdir(), "lf-parity-migrate-"));
try {
  cpSync(join(app, "prisma"), join(dir, "prisma"), { recursive: true });
  cpSync(join(app, "prisma.config.ts"), join(dir, "prisma.config.ts"));
  cpSync(join(app, "src/lib/database-target.ts"), join(dir, "src/lib/database-target.ts"), { recursive: true });
  cpSync(join(app, "package.json"), join(dir, "package.json"));
  symlinkSync(join(app, "node_modules"), join(dir, "node_modules"));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: runtime, DIRECT_URL: migrate };
  const result = spawnSync(join(app, "node_modules/.bin/prisma"), ["migrate", "deploy"], { cwd: dir, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const grants = spawnSync("psql", [migrate, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(app, "ops/postgres/runtime-grants.sql")], { stdio: "inherit", env: { PATH: process.env.PATH } });
  if (grants.status !== 0) process.exit(grants.status ?? 1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
