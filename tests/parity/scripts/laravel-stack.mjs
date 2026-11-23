#!/usr/bin/env node
// Runs parity gates against the Laravel portal (story 1.4; mirrors next-stack.mjs).
//   node scripts/laravel-stack.mjs [gate expression] [--repeat N] [--only <title regex>] [--keep] [-- extra playwright args]
// --only ANDs a title regex with the gate, for the tests of a not-yet-converted gate that already apply
// (e.g. the X-01 pre-I/O cells, story 1.4). No gate: every expression in converted-tags.txt (joined with "|"); none listed → nothing to run, exit 0.
// Steps: build and start apps/portal's own compose stack (postgres, init = .env + composer + migrate,
// app, web) as its own project with PUBLIC_SITE_URL = the base URL (infra/laravel.compose.yaml) →
// wait for /up → run the gate N times with PARITY_TARGET=laravel → `docker compose down -v` (unless --keep).
// PARITY_DATABASE_URL is the portal stack's DB, so its DB lock (adapters/seed.ts) never queues behind
// runs on the shared lf-parity stack. Seeding is `php artisan parity:seed` in the app container (adapters/seed.ts,
// story 2.6); the overlay's parity-marker service arms its guard. Prerequisite (as for next-stack.mjs):
// `npm run infra:up` — the overlay points Laravel at stripe-fake, Mailpit (SMTP) via host.docker.internal, and this
// script POSTs stripe-fake's webhookUrl to the Laravel stack. Postmark is not used here (MAIL_MAILER=smtp).
// Env: PARITY_LARAVEL_PORT (8000), PARITY_LARAVEL_PROJECT (lf-parity-laravel), PORTAL_*_PORT.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gateToRegex } from "./gate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const portal = join(root, "../../apps/portal");
const args = process.argv.slice(2);
const dash = args.indexOf("--");
const extra = dash >= 0 ? args.slice(dash + 1) : [];
const own = dash >= 0 ? args.slice(0, dash) : args;
const repeatAt = own.indexOf("--repeat");
const repeat = repeatAt >= 0 ? Number(own[repeatAt + 1]) : 1;
const keep = own.includes("--keep");
const onlyAt = own.indexOf("--only");
const only = onlyAt >= 0 ? own[onlyAt + 1] : null;
const valueAt = new Set([repeatAt, onlyAt].filter((i) => i >= 0).map((i) => i + 1));
const explicitGate = own.find((a, i) => !a.startsWith("--") && !valueAt.has(i)) ?? null;

function convertedGate(file = join(root, "converted-tags.txt")) {
  const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  return lines.length ? lines.join("|") : null;
}

const gate = explicitGate ?? convertedGate();
if (!gate) {
  console.log("laravel-stack: converted-tags.txt lists no gate yet; nothing to run against Laravel.");
  process.exit(0);
}
// gateToRegex fails fast on a malformed expression; --only becomes a leading lookahead.
const grep = only ? `^(?=.*(?:${only}))${gateToRegex(gate).slice(1)}` : gateToRegex(gate);
new RegExp(grep);

const PORT = Number(process.env.PARITY_LARAVEL_PORT || 8000);
const BASE = `http://127.0.0.1:${PORT}`;
const PG = process.env.PORTAL_PG_PORT || "55541";
const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: process.env.PARITY_LARAVEL_PROJECT || "lf-parity-laravel",
  PORTAL_HTTP_PORT: String(PORT), PORTAL_PG_PORT: PG,
  PORTAL_VITE_PORT: process.env.PORTAL_VITE_PORT || "15181", PORTAL_MAIL_PORT: process.env.PORTAL_MAIL_PORT || "18031",
  PORTAL_S3_PORT: process.env.PORTAL_S3_PORT || "18341", PARITY_LARAVEL_BASE_URL: BASE,
};
const compose = ["compose", "-f", join(portal, "compose.yaml"), "-f", join(root, "infra/laravel.compose.yaml")];

function docker(cmdArgs) {
  const r = spawnSync("docker", [...compose, ...cmdArgs], { env: composeEnv, cwd: portal, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`docker compose ${cmdArgs.join(" ")} failed (${r.status})`);
}
async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const res = await fetch(url); if (res.status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${url}`);
}

const STRIPE_URL = (process.env.PARITY_STRIPE_URL || `http://127.0.0.1:${process.env.PARITY_STRIPE_PORT || "58091"}`).replace(/\/$/, "");

let status = 1;
try {
  const health = await fetch(`${STRIPE_URL}/__health`).catch(() => null);
  if (!health?.ok) throw new Error(`stripe-fake not reachable at ${STRIPE_URL}: run \`npm run infra:up\` first`);
  // Build once first: init, app and worker share one image tag, and parallel builds race on it.
  docker(["build", "app"]);
  // @ui journeys need real assets: a leftover public/hot (a dev stack's Vite) points the pages at a dead dev server and
  // they render blank (found via DV-UX, 2026-11-23). Build once (git-ignored) and drop the hot file.
  rmSync(join(portal, "public/hot"), { force: true });
  if (!existsSync(join(portal, "public/build/manifest.json"))) docker(["run", "--rm", "--no-deps", "vite", "sh", "-c", "npm ci --no-fund --no-audit && npx vite build"]);
  // web pulls in app → init (.env, composer, migrations) → postgres. The worker sends every queued mail (admin
  // new-project, checkout resend links); without it those mails never leave the queue (found via DV-6, 2026-11-23).
  // parity-marker races the first postgres start (exit 2 on a cold volume); a second `up` finds it ready.
  try { docker(["up", "-d", "web", "worker"]); } catch { docker(["up", "-d", "web", "worker"]); }
  await waitFor(`${BASE}/up`, 300_000);
  const cfg = await fetch(`${STRIPE_URL}/__config`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ webhookUrl: `http://host.docker.internal:${PORT}/api/stripe/webhook` }) });
  if (!cfg.ok) throw new Error(`stripe-fake /__config failed (${cfg.status})`);
  const suiteEnv = {
    ...process.env, PARITY_TARGET: "laravel", PARITY_BASE_URL: BASE,
    PARITY_DATABASE_URL: `postgresql://portal_migrate:dev-only-migrate@127.0.0.1:${PG}/portal`,
  };
  for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "AI_AGENT"]) delete suiteEnv[k];
  status = 0;
  for (let i = 1; i <= repeat; i++) {
    console.log(`\n=== parity run on Laravel ${i}/${repeat} (gate ${gate}${only ? `, only ${only}` : ""}) ===`);
    const code = await new Promise((resolve) => {
      const child = spawn("npx", ["playwright", "test", "--grep", grep, ...extra], { cwd: root, env: suiteEnv, stdio: "inherit" });
      child.on("exit", (c) => resolve(c ?? 1));
    });
    if (code !== 0) { status = code; console.error(`run ${i} failed`); }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  status = 1;
} finally {
  // Restore stripe-fake's default webhook target (the Next parity server) so a later Next run isn't misrouted.
  await fetch(`${STRIPE_URL}/__config`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ webhookUrl: "http://host.docker.internal:4310/api/stripe/webhook" }) }).catch(() => {});
  if (keep) console.log(`laravel-stack: --keep, stack left running at ${BASE} (project ${composeEnv.COMPOSE_PROJECT_NAME})`);
  else spawnSync("docker", [...compose, "down", "-v", "--remove-orphans"], { env: composeEnv, cwd: portal, stdio: "inherit" });
}
process.exit(status);
