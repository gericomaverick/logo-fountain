#!/usr/bin/env node
// Structural rules for the parity suite (story 0.1):
//  1. Journeys never import target-specific page objects (pages/next, pages/laravel).
//  2. Every test title starts with inventory ID(s) that exist in 01-feature-inventory.md.
//  3. Every entry in expected-next-failures.txt is the exact title of an existing test.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = join(root, "../../docs/laravel-migration/01-feature-inventory.md");
const errors = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const inventory = readFileSync(inventoryPath, "utf8");
const knownIds = new Set([
  ...inventory.matchAll(/^\| ([AKCDNXO]-\d\d) \|/gm),
  ...inventory.matchAll(/^\| (DV-[0-9A-Z]+) \|/gm),
].map((m) => m[1]));
if (knownIds.size < 100) errors.push(`Inventory looks wrong: only ${knownIds.size} IDs parsed from ${inventoryPath}`);

const specs = walk(join(root, "journeys")).filter((f) => f.endsWith(".spec.ts"));
const titles = new Set();
const idPattern = /^((?:[AKCDNXO]-\d\d|DV-[0-9A-Z]+)(?:[,/](?:[AKCDNXO]-\d\d|DV-[0-9A-Z]+))*) /;

for (const file of specs) {
  const source = readFileSync(file, "utf8");
  const rel = relative(root, file);
  for (const m of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    if (/pages\/(next|laravel)(\/|$)/.test(m[1])) errors.push(`${rel}: imports target-specific page objects (${m[1]}); use pages/index.ts`);
  }
  for (const m of source.matchAll(/\btest(?:\.(?:only|skip|fixme))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) {
    const title = m[2];
    titles.add(title);
    const ids = title.match(idPattern);
    if (!ids) { errors.push(`${rel}: title must start with inventory ID(s): "${title}"`); continue; }
    for (const id of ids[1].split(/[,/]/)) if (!knownIds.has(id)) errors.push(`${rel}: unknown inventory ID ${id} in "${title}"`);
  }
}

const expected = readFileSync(join(root, "expected-next-failures.txt"), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
for (const title of expected) if (!titles.has(title)) errors.push(`expected-next-failures.txt: no test titled "${title}"`);

if (errors.length) {
  console.error(`Parity suite structure check failed (${errors.length}):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Parity suite structure OK: ${specs.length} spec file(s), ${titles.size} test(s), ${expected.length} expected Next failure(s).`);
