// Shared helpers for the client contract suites (story 0.7b). Black-box only: HTTP via adapters/api.ts,
// seeding via adapters/seed.ts. No target branching here.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { apiClient, baseURL } from "../../adapters/api";
import { scenarioId, seed } from "../../adapters/seed";
import { expect, test } from "../../fixtures";

const here = dirname(fileURLToPath(import.meta.url));

export const ADMIN = "admin@parity.test";
export const CLIENT_A = "client.a@parity.test";
export const CLIENT_B = "client.b@parity.test";

/** Deterministic project / concept IDs, as both seeders derive them. */
export const projectId = (scenario: string, key = "p1") => scenarioId(scenario, "project", key);
export const conceptId = (scenario: string, n: number, key = "p1") => scenarioId(scenario, "concept", `${key}:${n}`);
/** A well-formed UUID that names nothing in any scenario. */
export const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

// ---------------------------------------------------------------------------------------------
// Seeding. Every seed truncates the whole parity DB, so tests that seed must not overlap, even
// across Playwright workers. A cross-process lock (mkdir is atomic) is held from seed to test end.
// SHARED-CHANGE candidate: move this into adapters/seed.ts (or run contract tests with workers=1).
const lockDir = join(tmpdir(), `lf-parity-seed-${createHash("sha1").update(baseURL).digest("hex").slice(0, 12)}.lock`);
const STALE_MS = 180_000;
let holding = false;
const open: APIRequestContext[] = [];

async function acquireSeedLock() {
  for (;;) {
    try {
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, "owner"), String(process.pid));
      holding = true;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockDir).mtimeMs > STALE_MS) rmSync(lockDir, { recursive: true, force: true });
      } catch {
        // Released between the check and the stat.
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

function releaseSeedLock() {
  if (!holding) return;
  holding = false;
  rmSync(lockDir, { recursive: true, force: true });
}

/** Register beforeEach/afterEach that seed `scenario` freshly for every test in the current scope. */
export function useScenario(scenario: string) {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async () => {
    await acquireSeedLock();
    seed(scenario);
  });
  test.afterEach(async () => {
    await Promise.all(open.splice(0).map((ctx) => ctx.dispose()));
    releaseSeedLock();
  });
}

// ---------------------------------------------------------------------------------------------
// Clients. Every context is disposed after the test (in useScenario's afterEach).

export async function as(email?: string): Promise<APIRequestContext> {
  const ctx = await apiClient(email ? { signInAs: email } : {});
  open.push(ctx);
  return ctx;
}
export const anonymous = () => as();

// ---------------------------------------------------------------------------------------------
// Assertions.

/** Asserts the X-03 error envelope `{error:{message, code, details?}}` with the given status and code. */
export async function expectError(res: APIResponse, status: number, code: string) {
  const text = await res.text();
  expect(res.status(), `${res.url()} -> ${text.slice(0, 300)}`).toBe(status);
  const body = JSON.parse(text);
  expect(body).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) });
  expect(Object.keys(body.error).every((k) => ["message", "code", "details"].includes(k))).toBe(true);
  return body as { error: { message: string; code: string; details?: Record<string, unknown> } };
}

export async function expectJson(res: APIResponse, status = 200) {
  const text = await res.text();
  expect(res.status(), `${res.url()} -> ${text.slice(0, 300)}`).toBe(status);
  return JSON.parse(text);
}

export const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exact key set (order-insensitive), optionally allowing extra keys. */
export function expectKeys(value: unknown, keys: string[], allowed: string[] = []) {
  expect(value).toBeInstanceOf(Object);
  const actual = Object.keys(value as object).filter((k) => !allowed.includes(k)).sort();
  expect(actual).toEqual([...keys].sort());
}

// ---------------------------------------------------------------------------------------------
// Snapshot JSON Schema (fixtures/contracts/snapshot.schema.json) and a small validator for the
// subset it uses. Returns a list of "path: problem" strings (empty = valid).
export const snapshotSchema = JSON.parse(readFileSync(join(here, "../../fixtures/contracts/snapshot.schema.json"), "utf8"));

type Schema = Record<string, any>;
const FORMATS: Record<string, RegExp> = { "date-time": ISO, uuid: UUID };

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

export function validate(value: unknown, schema: Schema, root: Schema = schema, path = "$"): string[] {
  if (schema.$ref) {
    const def = (schema.$ref as string).replace(/^#\//, "").split("/").reduce((s: any, k: string) => s?.[k], root);
    if (!def) return [`${path}: unresolved $ref ${schema.$ref}`];
    return validate(value, def, root, path);
  }
  const errors: string[] = [];
  const t = typeOf(value);
  if (schema.type) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some((x) => x === t || (x === "number" && t === "integer"));
    if (!ok) return [`${path}: expected ${types.join("|")}, got ${t}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if ("const" in schema && value !== schema.const) errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  if (typeof schema.minimum === "number" && typeof value === "number" && value < schema.minimum) errors.push(`${path}: ${value} < ${schema.minimum}`);
  if (schema.format && typeof value === "string" && FORMATS[schema.format] && !FORMATS[schema.format].test(value)) errors.push(`${path}: not ${schema.format}: ${value}`);
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) errors.push(`${path}: missing ${key}`);
    const props: Record<string, Schema> = schema.properties ?? {};
    for (const [key, v] of Object.entries(obj)) {
      if (props[key]) errors.push(...validate(v, props[key], root, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected key ${key}`);
    }
  }
  if (t === "array" && schema.items) (value as unknown[]).forEach((v, i) => errors.push(...validate(v, schema.items, root, `${path}[${i}]`)));
  return errors;
}

export function expectSnapshotShape(snapshot: unknown) {
  expect(validate(snapshot, snapshotSchema)).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// Fixtures for request bodies.

/** A complete brief: every required field filled (brief.ts required set). */
export const VALID_BRIEF = {
  brandName: "Parity Bakery",
  tagline: "",
  industry: "Bakery",
  offerSummary: "Sourdough and pastries for the neighbourhood.",
  audiencePrimary: "Local families.",
  audienceSecondary: "",
  businessGoals: "Grow weekend trade.",
  brandPersonality: "Warm, Approachable",
  styleDirection: "Wordmark",
  colorPreferences: "",
  mustInclude: "",
  avoidanceNotes: "",
  usageContexts: "Signage, Packaging",
  deliverablesContext: "",
  competitors: "",
  additionalNotes: "",
};
export const BRIEF_KEYS = Object.keys(VALID_BRIEF);

export async function snapshotOf(ctx: APIRequestContext, id: string) {
  const body = await expectJson(await ctx.get(`/api/projects/${id}`));
  return body.snapshot as Record<string, any>;
}
