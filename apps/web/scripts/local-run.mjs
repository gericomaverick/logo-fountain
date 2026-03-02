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

// Basic required vars for local run.
requireEnv("STRIPE_SECRET_KEY");
requireEnv("NEXT_PUBLIC_SUPABASE_URL");
requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const port = process.env.PORT || "3000";

console.log(`Starting Stripe webhook forwarder -> http://localhost:${port}/api/stripe/webhook`);

const stripeListen = spawn(
  "stripe",
  ["listen", "--forward-to", `localhost:${port}/api/stripe/webhook`],
  { stdio: ["inherit", "pipe", "pipe"], env: process.env }
);

let webhookSecret = null;

stripeListen.stdout.on("data", (buf) => {
  const text = buf.toString();
  process.stdout.write(text);

  const match = text.match(/whsec_[a-zA-Z0-9]+/);
  if (match && !webhookSecret) {
    webhookSecret = match[0];
    console.log(`\nCaptured webhook secret from Stripe CLI.`);
    console.log(`Starting Next dev server with STRIPE_WEBHOOK_SECRET set (not writing to disk).`);

    const childEnv = { ...process.env, STRIPE_WEBHOOK_SECRET: webhookSecret, PORT: port };

    const dev = spawn("npm", ["run", "dev", "--", "--port", port], {
      stdio: "inherit",
      env: childEnv,
    });

    dev.on("exit", (code) => {
      stripeListen.kill("SIGTERM");
      process.exit(code ?? 0);
    });
  }
});

stripeListen.stderr.on("data", (buf) => {
  process.stderr.write(buf.toString());
});

stripeListen.on("exit", (code) => {
  if (!webhookSecret) {
    console.error(`Stripe listen exited before webhook secret was captured (code=${code}).`);
  }
  process.exit(code ?? 1);
});

process.on("SIGINT", () => {
  stripeListen.kill("SIGINT");
});
