#!/usr/bin/env node
// Coverage gate (story 0.9, test strategy §3/§5). Fails when:
//  - an inventory row (A, K, C, D, N, X series; O-series excluded) has no parity test whose title
//    starts with or lists its ID, and no recorded Laravel-only destination; or
//  - a DV row has no @deviation test whose title names the DV id, and no recorded
//    Laravel-only destination.
// Laravel-only destinations live in fixtures/laravel-only-destinations.json: { "<ID>": "<layer + story>" }.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inventory = readFileSync(join(root, "../../docs/laravel-migration/01-feature-inventory.md"), "utf8");
const destinations = JSON.parse(readFileSync(join(root, "fixtures/laravel-only-destinations.json"), "utf8"));

const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const titles = [];
for (const f of walk(join(root, "journeys")).filter((f) => f.endsWith(".spec.ts"))) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\btest(?:\.(?:only|skip|fixme))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) titles.push(m[2]);
  // Parameterised titles (template literals) can't be resolved statically: count IDs in the template text.
}
const ids = (t) => new Set(t.match(/\b(?:[AKCDNXO]-\d\d|DV-[0-9A-Z]+)\b/g) ?? []);
const covered = new Map();
for (const t of titles) for (const id of ids(t)) covered.set(id, (covered.get(id) ?? 0) + 1);

const rows = [...inventory.matchAll(/^\| ([AKCDNX]-\d\d) \|/gm)].map((m) => m[1]);
const dvRows = [...inventory.matchAll(/^\| (DV-[0-9A-Z]+) \| ([^|]*) \|/gm)].map((m) => ({ id: m[1], rows: [...ids(m[2])] }));
const deviationTitles = titles.filter((t) => /@deviation\b/.test(t));

const missing = rows.filter((id) => !covered.has(id) && !destinations[id]);
const dvMissing = dvRows.filter(({ id }) => !destinations[id] &&
  !deviationTitles.some((t) => new RegExp(`\\b${id}\\b`).test(t)));

console.log(`Coverage: ${rows.length - missing.length}/${rows.length} inventory rows, ${dvRows.length - dvMissing.length}/${dvRows.length} DV rows (${titles.length} tests, ${Object.keys(destinations).length} Laravel-only destinations).`);
if (missing.length || dvMissing.length) {
  if (missing.length) console.error(`Rows with no parity test and no Laravel-only destination: ${missing.join(", ")}`);
  if (dvMissing.length) console.error(`DV rows with no @deviation test and no Laravel-only destination: ${dvMissing.map((d) => d.id).join(", ")}`);
  process.exit(1);
}
