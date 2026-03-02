#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config({ override: false });

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name} (set it in .env.local)`);
    process.exit(1);
  }
  return v;
}

// Required to boot app.
requireEnv("NEXT_PUBLIC_SUPABASE_URL");
requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");
requireEnv("STRIPE_SECRET_KEY");

const port = process.env.PORT || "3000";
let currentWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || null;

let devProc = null;

function startDev(extraEnv = {}) {
  if (devProc) return;

  const env = { ...process.env, ...extraEnv, PORT: port };
  console.log(`Starting Next dev server on http://localhost:${port}`);
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.log(
      "Warning: STRIPE_WEBHOOK_SECRET is not set yet. Webhooks will 400 until Stripe listen provides one (the script will auto-restart dev once captured)."
    );
  }

  devProc = spawn("npm", ["run", "dev", "--", "--port", port], {
    stdio: "inherit",
    env,
  });

  devProc.on("exit", (code) => {
    devProc = null;
    process.exit(code ?? 0);
  });
}

function restartDevWithWebhookSecret(whsec) {
  if (currentWebhookSecret === whsec) return;
  currentWebhookSecret = whsec;

  console.log("\nStripe webhook secret captured/updated. Restarting dev server with STRIPE_WEBHOOK_SECRET (not writing to disk).\n");

  if (devProc) {
    devProc.removeAllListeners("exit");
    devProc.on("exit", () => {
      devProc = null;
      startDev({ STRIPE_WEBHOOK_SECRET: whsec });
    });
    devProc.kill("SIGTERM");
  } else {
    startDev({ STRIPE_WEBHOOK_SECRET: whsec });
  }
}

// Start dev immediately so localhost is available even if Stripe CLI needs auth.
startDev(currentWebhookSecret ? { STRIPE_WEBHOOK_SECRET: currentWebhookSecret } : {});

console.log(`Starting Stripe webhook forwarder -> http://localhost:${port}/api/stripe/webhook`);

const stripeListen = spawn(
  "stripe",
  ["listen", "--forward-to", `localhost:${port}/api/stripe/webhook`],
  { stdio: ["inherit", "pipe", "pipe"], env: process.env }
);

stripeListen.stdout.on("data", (buf) => {
  const text = buf.toString();
  process.stdout.write(text);

  const match = text.match(/whsec_[a-zA-Z0-9]+/);
  if (match) restartDevWithWebhookSecret(match[0]);
});

stripeListen.stderr.on("data", (buf) => {
  process.stderr.write(buf.toString());
});

stripeListen.on("exit", (code) => {
  console.error(`Stripe listen exited (code=${code}). Dev server will keep running.`);
});

process.on("SIGINT", () => {
  stripeListen.kill("SIGINT");
  if (devProc) devProc.kill("SIGINT");
});
