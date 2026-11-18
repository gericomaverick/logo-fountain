#!/usr/bin/env node
// Proves the expected-failure mechanism (story 0.1, AC4) without needing a running app:
//  A. a listed test that FAILS on Next  -> run passes
//  B. a listed test that PASSES on Next -> run fails
//  C. on Laravel the list is ignored    -> the failing test fails the run
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = mkdtempSync(join(process.cwd(), ".selftest-"));
function run(name, target, listed, grep) {
  const list = join(dir, `${name}.txt`);
  writeFileSync(list, listed.join("\n") + "\n");
  const r = spawnSync("npx", ["playwright", "test", "--grep", grep, "--reporter", "line"], {
    env: { ...process.env, PARITY_SELFTEST: "1", PARITY_TARGET: target, PARITY_EXPECTED_FAILURES: list },
    encoding: "utf8",
  });
  return r.status;
}

const cases = [
  ["A: listed failing test on Next", run("a", "next", ["O-01 selftest failing test"], "failing test"), 0],
  ["B: listed passing test on Next", run("b", "next", ["O-01 selftest passing test"], "passing test"), 1],
  ["C: list ignored on Laravel", run("c", "laravel", ["O-01 selftest failing test"], "failing test"), 1],
];
let ok = true;
for (const [label, status, want] of cases) {
  const pass = want === 0 ? status === 0 : status !== 0;
  ok &&= pass;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label} (exit ${status}, wanted ${want === 0 ? "0" : "non-zero"})`);
}
process.exit(ok ? 0 : 1);
