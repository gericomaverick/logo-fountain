#!/usr/bin/env node
// `npm run infra:probe`: proves the running parity stack (story 0.2).
// DB bootstrap, S3 conditional-PUT probe, postmark-shim -> Mailpit, stripe-fake selftest (real Stripe SDK).
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const compose = ["compose", "-f", join(here, "docker-compose.test.yml")];
const steps = [];

function psql(user, password, sql) {
  return spawnSync("docker", [...compose, "exec", "-T", "-e", `PGPASSWORD=${password}`, "postgres",
    "psql", "-h", "127.0.0.1", "-U", user, "-d", "lf_parity", "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" });
}

// TEST-ONLY passwords, as in docker-compose.test.yml.
console.log("== postgres bootstrap");
{
  const checks = [
    ["runtime role reads parity.parity_marker", psql("lf_runtime", "parity-test-only-runtime", "select count(*) from parity.parity_marker"), (r) => r.status === 0 && r.stdout.trim() === "1"],
    ["runtime role cannot create tables in public", psql("lf_runtime", "parity-test-only-runtime", "create table public.probe_should_fail(x int)"), (r) => r.status !== 0 && /permission denied/.test(r.stderr)],
    ["lf_migrate owns database lf_parity and schemas public, parity; public is empty",
      psql("lf_migrate", "parity-test-only-migrate", "select (select pg_get_userbyid(datdba) from pg_database where datname='lf_parity') || ',' || string_agg(pg_get_userbyid(nspowner), ',' order by nspname) || ',' || (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') from pg_namespace where nspname in ('public','parity')"),
      (r) => r.status === 0 && r.stdout.trim() === "lf_migrate,lf_migrate,lf_migrate,0"],
  ];
  let ok = true;
  for (const [name, r, pass] of checks) {
    const passed = pass(r);
    ok &&= passed;
    console.log(`${passed ? "PASS" : "FAIL"}  ${name}  (${(r.stdout || r.stderr || "").trim().split("\n")[0]})`);
  }
  steps.push(["postgres", ok]);
}

for (const [name, script] of [["s3", "probe-s3-conditional.mjs"], ["mail", "probe-mail.mjs"], ["stripe", "stripe-fake.selftest.mjs"]]) {
  console.log(`\n== ${name} (${script})`);
  const r = spawnSync(process.execPath, [join(here, script)], { stdio: "inherit" });
  steps.push([name, r.status === 0]);
}

console.log(`\nInfra probe: ${steps.map(([n, ok]) => `${n} ${ok ? "OK" : "FAILED"}`).join(", ")}`);
if (steps.some(([, ok]) => !ok)) process.exit(1);
