#!/usr/bin/env node
// Runs parity gates against the Next.js app on the default parity stack (story 0.9).
//   node scripts/next-stack.mjs [gate expression] [--repeat N] [-- extra playwright args]
// Prerequisite: `npm run infra:up` (default ports). Steps: migrate lf_parity → start `next dev` on
// 127.0.0.1:4310 (env -i, no AI-agent variables) → TCP forwarder 0.0.0.0:4311 for stripe-fake's
// webhooks → POST /__config to stripe-fake → run the gate N times → stop everything.
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gateToRegex } from "./gate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "../../apps/web");
const args = process.argv.slice(2);
const dash = args.indexOf("--");
const extra = dash >= 0 ? args.slice(dash + 1) : [];
const own = dash >= 0 ? args.slice(0, dash) : args;
const repeatAt = own.indexOf("--repeat");
const repeat = repeatAt >= 0 ? Number(own[repeatAt + 1]) : 1;
const gate = own.find((a, i) => !a.startsWith("--") && (repeatAt < 0 || i !== repeatAt + 1)) ?? null;

const PORT = 4310, FORWARD = 4311;
const M = "postgresql://lf_migrate:parity-test-only-migrate@127.0.0.1:55432/lf_parity";
const R = "postgresql://lf_runtime:parity-test-only-runtime@127.0.0.1:55432/lf_parity";
const base = { PATH: process.env.PATH, HOME: process.env.HOME };
const r2 = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_ACCESS_KEY_ID: "parity-test-only-access-key",
  R2_SECRET_ACCESS_KEY: "parity-test-only-secret-key", R2_CONCEPTS_BUCKET: "lf-parity-concepts",
  R2_FINAL_DELIVERABLES_BUCKET: "lf-parity-final-deliverables", R2_ENDPOINT: "http://127.0.0.1:58333",
};
const appEnv = {
  ...base, ...r2, NODE_ENV: "development", PARITY_MODE: "1", DATABASE_URL: R, DIRECT_URL: M,
  BETTER_AUTH_SECRET: "parity-test-only-better-auth-secret-0123456789", PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
  PUBLIC_MARKETING_SITE_URL: "http://127.0.0.1:4399", STRIPE_SECRET_KEY: "sk_test_parity", STRIPE_API_BASE: "http://127.0.0.1:58091",
  STRIPE_WEBHOOK_SECRET: "whsec_parity_test_only_0000000000000000", POSTMARK_SERVER_TOKEN: "parity",
  POSTMARK_FROM: "portal@parity.test", POSTMARK_API_URL: "http://127.0.0.1:58090/email", ADMIN_NOTIFICATION_EMAILS: "admin@parity.test",
};

function run(cmd, cmdArgs, env, cwd) {
  const r = spawnSync(cmd, cmdArgs, { env, cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(" ")} failed (${r.status})`);
}
async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const res = await fetch(url); if (res.status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${url}`);
}

run(process.execPath, [join(web, "scripts/parity-migrate.mjs")], { ...base, PARITY_MODE: "1", PARITY_DATABASE_URL: M, PARITY_RUNTIME_DATABASE_URL: R });
const next = spawn(join(web, "node_modules/.bin/next"), ["dev", "--hostname", "127.0.0.1", "--port", String(PORT), ...(process.env.NEXT_DEV_FLAGS ?? "").split(" ").filter(Boolean)],
  { cwd: web, env: appEnv, stdio: ["ignore", "ignore", "inherit"] });
const forwarder = net.createServer((client) => {
  const upstream = net.connect(PORT, "127.0.0.1");
  client.pipe(upstream).pipe(client);
  client.on("error", () => upstream.destroy()); upstream.on("error", () => client.destroy());
}).listen(FORWARD, "0.0.0.0");
let status = 1;
try {
  await waitFor(`http://127.0.0.1:${PORT}/login`, 240_000);
  // Warm up: next dev compiles each route on first request and can drop a connection meanwhile (A-15 flake).
  for (const path of ["/", "/login", "/dashboard", "/admin", "/forgot-password", "/set-password", "/reset-password", "/auth/callback",
    "/checkout/success", "/settings", "/settings/invoices", "/api/auth/session", "/api/health"]) {
    await fetch(`http://127.0.0.1:${PORT}${path}`, { redirect: "manual" }).catch(() => {});
  }
  await fetch("http://127.0.0.1:58091/__config", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ webhookUrl: `http://host.docker.internal:${FORWARD}/api/stripe/webhook` }) });
  const suiteEnv = { ...process.env, ...r2, PARITY_TARGET: "next", PARITY_BASE_URL: `http://127.0.0.1:${PORT}`, PARITY_DATABASE_URL: M };
  for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "AI_AGENT"]) delete suiteEnv[k];
  status = 0;
  for (let i = 1; i <= repeat; i++) {
    console.log(`\n=== parity run ${i}/${repeat}${gate ? ` (gate ${gate})` : " (full suite)"} ===`);
    // Async on purpose: the webhook forwarder above lives in this process, and a blocking spawnSync would
    // freeze its event loop for the whole run (every stripe-fake delivery then times out).
    const code = await new Promise((resolve) => {
      const child = spawn("npx", ["playwright", "test", ...(gate ? ["--grep", gateToRegex(gate)] : []), ...extra], { cwd: root, env: suiteEnv, stdio: "inherit" });
      child.on("exit", (c) => resolve(c ?? 1));
    });
    if (code !== 0) { status = code; console.error(`run ${i} failed`); }
  }
} finally {
  next.kill("SIGTERM"); forwarder.close();
}
process.exit(status);
