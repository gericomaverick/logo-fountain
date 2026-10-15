#!/usr/bin/env node
// Run after deployment has injected runtime env, BEFORE launching Next.
// Direct `next start` / serverless deployments bypass this preflight; auth
// route handlers still enforce the same requirement on each production request.
import { configuredAuthProxy } from "../src/lib/auth/proxy-config.mjs";

if ((process.argv.includes("--production") || process.env.NODE_ENV === "production") && !configuredAuthProxy(process.env)) {
  console.error("Auth proxy preflight failed: set exactly one valid AUTH_CLIENT_IP_HEADER or AUTH_TRUSTED_PROXY_HOPS");
  process.exitCode = 1;
}
