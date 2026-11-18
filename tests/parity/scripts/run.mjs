#!/usr/bin/env node
// Usage: node scripts/run.mjs "<gate expression>" [extra playwright args]
// Example: PARITY_TARGET=next node scripts/run.mjs "@smoke"
import { spawnSync } from "node:child_process";
import { gateToRegex } from "./gate.mjs";

const [expression, ...rest] = process.argv.slice(2);
if (!expression) {
  console.error('Usage: node scripts/run.mjs "<gate expression>" [playwright args]');
  process.exit(2);
}
const result = spawnSync("npx", ["playwright", "test", "--grep", gateToRegex(expression), ...rest], { stdio: "inherit" });
process.exit(result.status ?? 1);
