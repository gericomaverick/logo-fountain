/**
 * Shared rule fixtures (Laravel migration story 0.6b).
 *
 * The JSON files in tests/parity/fixtures/rules/ are the contract the PHP ports
 * must match case-for-case. Inputs are authored here; expected values are
 * produced by running the Next.js functions.
 *
 *   CAPTURE=1 npx vitest run src/lib/__tests__/shared-rule-fixtures.test.ts
 *     regenerates the fixture files from the live functions.
 *   npm run test
 *     asserts every fixture case still equals the live function output, and
 *     that the fixture inputs match the authored inputs below (no stale file).
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { safeAuthNextPath } from "@/lib/auth/safe-next";
import { normalizeBriefAnswers, validateBriefSubmission } from "@/lib/brief";
import { computeEntitlementUsage, type EntitlementRow } from "@/lib/entitlements";
import {
  PRIMARY_CTA_BY_STATE,
  PROJECT_STATE_LABELS,
  PROJECT_STATES,
  applyTransition,
  buildTimeline,
  canTransition,
  customerActionFor,
  getAllowedTransitions,
} from "@/lib/project-state-machine";
import { deriveDisplayProjectStatus, deriveOverviewBadgeStatus } from "@/lib/project-status";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Input = Record<string, Json> | null;
type Case = { fn: string; input: Input; expected?: Json };
type FixtureSpec = {
  file: string;
  source: string;
  fns: Record<string, (input: Input) => unknown>;
  inputs: Array<{ fn: string; input: Input }>;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../..");
const fixtureDir = path.resolve(webRoot, "../../tests/parity/fixtures/rules");
const capture = process.env.CAPTURE === "1";

/** JSON round-trip: drops undefined properties exactly as the fixture file does. */
function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function arg<T>(input: Input, key: string): T {
  return (input ?? {})[key] as T;
}

// ---------------------------------------------------------------------------
// state-machine.json
// ---------------------------------------------------------------------------

const INVALID_STATES = ["APPROVED", "", "awaiting_brief", " AWAITING_BRIEF", "UNKNOWN"];
const STATES: string[] = [...PROJECT_STATES];
const FIXED_TIMESTAMPS: Record<string, string> = Object.fromEntries(
  STATES.map((state, i) => [state, `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`]),
);

function stateMachineInputs(): FixtureSpec["inputs"] {
  const cases: FixtureSpec["inputs"] = [];
  const constants = ["PROJECT_STATES", "PROJECT_STATE_LABELS", "PRIMARY_CTA_BY_STATE"];
  for (const fn of constants) cases.push({ fn, input: null });

  for (const from of [...STATES, ...INVALID_STATES]) cases.push({ fn: "getAllowedTransitions", input: { from } });

  for (const from of STATES) for (const to of STATES) cases.push({ fn: "canTransition", input: { from, to } });
  for (const bad of INVALID_STATES) {
    cases.push({ fn: "canTransition", input: { from: bad, to: "BRIEF_SUBMITTED" } });
    cases.push({ fn: "canTransition", input: { from: "AWAITING_BRIEF", to: bad } });
  }
  cases.push({ fn: "canTransition", input: { from: "APPROVED", to: "FINAL_FILES_READY" } });
  cases.push({ fn: "canTransition", input: { from: "AWAITING_APPROVAL", to: "APPROVED" } });

  // Every ordered pair with a reason: isolates the transition table.
  for (const current of STATES) {
    for (const next of STATES) {
      cases.push({ fn: "applyTransition", input: { current, next, context: { reason: "Client asked" } } });
    }
  }
  // Every ordered pair with no context: the reason rules fire before the table.
  for (const current of STATES) for (const next of STATES) cases.push({ fn: "applyTransition", input: { current, next } });
  // Blank-reason shapes for each reason-gated target.
  const blankContexts: Json[] = [{}, { reason: "" }, { reason: "   " }, { reason: "\t\n" }, { reason: " " }, { reason: "﻿" }, { reason: null }];
  for (const next of ["ON_HOLD", "CANCELLED", "REFUNDED"]) {
    for (const context of blankContexts) cases.push({ fn: "applyTransition", input: { current: "IN_DESIGN", next, context } });
    cases.push({ fn: "applyTransition", input: { current: "IN_DESIGN", next, context: { reason: "  padded  " } } });
  }
  // Invalid states win over the reason rules; onHoldPreviousState is ignored.
  for (const bad of INVALID_STATES) {
    cases.push({ fn: "applyTransition", input: { current: bad, next: "ON_HOLD" } });
    cases.push({ fn: "applyTransition", input: { current: "IN_DESIGN", next: bad, context: { reason: "x" } } });
  }
  cases.push({ fn: "applyTransition", input: { current: "ON_HOLD", next: "IN_DESIGN", context: { reason: "Resume", onHoldPreviousState: "CONCEPTS_READY" } } });
  cases.push({ fn: "applyTransition", input: { current: "ON_HOLD", next: "IN_DESIGN", context: { onHoldPreviousState: "garbage" } } });

  for (const state of [...STATES, "APPROVED", "", "UNKNOWN"]) cases.push({ fn: "customerActionFor", input: { state } });
  cases.push({ fn: "customerActionFor", input: { state: null } });
  cases.push({ fn: "customerActionFor", input: {} });

  for (const currentState of [...STATES, "APPROVED", "UNKNOWN", ""]) {
    cases.push({ fn: "buildTimeline", input: { currentState, timestamps: FIXED_TIMESTAMPS } });
    cases.push({ fn: "buildTimeline", input: { currentState, timestamps: FIXED_TIMESTAMPS, options: { hasApprovedMilestone: false } } });
    cases.push({ fn: "buildTimeline", input: { currentState, timestamps: FIXED_TIMESTAMPS, options: { hasApprovedMilestone: true } } });
  }
  for (const currentState of ["CONCEPTS_READY", "AWAITING_APPROVAL", "ON_HOLD"]) {
    cases.push({ fn: "buildTimeline", input: { currentState } });
    cases.push({ fn: "buildTimeline", input: { currentState, timestamps: { AWAITING_BRIEF: "2026-02-01T00:00:00.000Z", AWAITING_APPROVAL: "2026-02-05T00:00:00.000Z" }, options: { hasApprovedMilestone: true } } });
  }
  return cases;
}

const stateMachine: FixtureSpec = {
  file: "state-machine.json",
  source: "apps/web/src/lib/project-state-machine.ts",
  fns: {
    PROJECT_STATES: () => PROJECT_STATES,
    PROJECT_STATE_LABELS: () => PROJECT_STATE_LABELS,
    PRIMARY_CTA_BY_STATE: () => PRIMARY_CTA_BY_STATE,
    getAllowedTransitions: (i) => getAllowedTransitions(arg(i, "from")),
    canTransition: (i) => canTransition(arg(i, "from"), arg(i, "to")),
    applyTransition: (i) => applyTransition(arg(i, "current"), arg(i, "next"), arg(i, "context")),
    customerActionFor: (i) => customerActionFor(arg(i, "state")),
    buildTimeline: (i) => buildTimeline(arg(i, "currentState"), arg(i, "timestamps"), arg(i, "options")),
  },
  inputs: stateMachineInputs(),
};

// ---------------------------------------------------------------------------
// safe-next.json
// ---------------------------------------------------------------------------

const SAFE_NEXT_RAW: Array<string | null> = [
  // safe-next.test.ts: allowed
  "/dashboard",
  "/project/p1?tab=brief#top",
  "/project/brand%20name",
  "/discount%25",
  // safe-next.test.ts: query and fragment data preserved
  "/project/p1?note=%5C",
  "/project/p1#example%5Ctext",
  "/project/p1?value=%2525",
  "/project/p1?return=https://evil.example/a#//evil.example",
  "/project/p1?note=\\literal#fragment",
  // safe-next.test.ts: rejected
  null,
  "",
  "https://evil.example/path",
  "javascript:alert(1)",
  "//evil.example/path",
  "///evil.example/path",
  "/\\evil.example/path",
  "\\\\evil.example/path",
  "/%2fevil.example/path",
  "/%2Fevil.example/path",
  "/%5cevil.example/path",
  "/%255cevil.example/path",
  "/%25252525252fevil.example/path",
  "%2f%2fevil.example/path",
  "/%00evil",
  "/%250aevil",
  "/line\nbreak",
  "/bad%",
  // Shape
  "/",
  "dashboard",
  "?next=/dashboard",
  "#/dashboard",
  "/?",
  "/#",
  " /dashboard",
  "/dashboard ",
  "/a//b",
  "/a\\b",
  "/a?x=\\y",
  "/a#\\y",
  // Raw control characters
  "/a\tb",
  "/a\rb",
  "/a\u0000b",
  "/a\u001fb",
  "/a\u007fb",
  "/a?x=\u0001",
  // Encoded slash / backslash in the middle of the path
  "/foo%2fbar",
  "/foo%5cbar",
  "/foo%2f%2fbar",
  "/%2f",
  "/%5C",
  "/%2F%2Fevil.example",
  // Encoded control characters
  "/%0a",
  "/%0D",
  "/%09evil",
  "/%1f",
  "/%7f",
  "/%7F",
  "/%20ok",
  // %25 layers
  "/%25",
  "/%2525",
  "/%25252f",
  "/%252f",
  "/%25255c",
  "/%2500",
  "/%25257f",
  "/%2525252525252525252525",
  "/%25%",
  // Malformed and non-ASCII encodings
  "/%zz",
  "/%2",
  "/%u002f",
  "/caf%C3%A9",
  "/caf%c3%a9",
  "/bad%C3",
  "/bad%C3%28",
  "/%E2%82%AC",
  "/%F0%9F%98%80",
  "/café",
  "/a+b",
  "/a+b%2520c",
  // Encoded ? and # in the path
  "/%3F//evil.example",
  "/%23//evil.example",
  "/a%3Fb=1",
  // Query and fragment are not decoded or checked
  "/a?x=%2f%2f",
  "/a?x=%zz",
  "/a#%",
  "/a?next=//evil.example",
];

function safeNextInputs(): FixtureSpec["inputs"] {
  const cases: FixtureSpec["inputs"] = SAFE_NEXT_RAW.map((raw) => ({ fn: "safeAuthNextPath", input: { raw } }));
  cases.push({ fn: "safeAuthNextPath", input: {} });
  cases.push({ fn: "safeAuthNextPath", input: { raw: "//evil.example", fallback: "/login" } });
  cases.push({ fn: "safeAuthNextPath", input: { raw: null, fallback: "/login" } });
  cases.push({ fn: "safeAuthNextPath", input: { raw: "/projects", fallback: "/login" } });
  cases.push({ fn: "safeAuthNextPath", input: { raw: "/%2f", fallback: "/settings?x=1" } });
  return cases;
}

const safeNext: FixtureSpec = {
  file: "safe-next.json",
  source: "apps/web/src/lib/auth/safe-next.ts",
  fns: {
    safeAuthNextPath: (i) => {
      const fallback = arg<string | undefined>(i, "fallback");
      return fallback === undefined ? safeAuthNextPath(arg(i, "raw")) : safeAuthNextPath(arg(i, "raw"), fallback);
    },
  },
  inputs: safeNextInputs(),
};

// ---------------------------------------------------------------------------
// brief.json
// ---------------------------------------------------------------------------

const BRIEF_MAX: Record<string, number> = {
  brandName: 120,
  tagline: 140,
  industry: 120,
  offerSummary: 700,
  audiencePrimary: 500,
  audienceSecondary: 400,
  businessGoals: 500,
  brandPersonality: 400,
  styleDirection: 700,
  colorPreferences: 400,
  mustInclude: 450,
  avoidanceNotes: 450,
  usageContexts: 500,
  deliverablesContext: 400,
  competitors: 500,
  additionalNotes: 500,
};

const COMPLETE_BRIEF: Record<string, string> = {
  brandName: "Northvale Analytics",
  tagline: "Numbers, minus the headache",
  industry: "B2B SaaS",
  offerSummary: "Subscription accounting software for UK freelancers.",
  audiencePrimary: "Freelancers and sole traders.",
  audienceSecondary: "Small agencies.",
  businessGoals: "Look more premium.",
  brandPersonality: "Modern, Trustworthy — calm",
  styleDirection: "Wordmark",
  colorPreferences: "Cool blues and greens",
  mustInclude: "The ® mark",
  avoidanceNotes: "No gradients",
  usageContexts: "Website, App icon",
  deliverablesContext: "Icon-first",
  competitors: "Xero, FreeAgent",
  additionalNotes: "Launch in March",
};

const REQUIRED_BRIEF = [
  "brandName",
  "industry",
  "offerSummary",
  "audiencePrimary",
  "businessGoals",
  "brandPersonality",
  "styleDirection",
  "usageContexts",
];

function without(source: Record<string, Json>, ...keys: string[]): Record<string, Json> {
  const copy = { ...source };
  for (const key of keys) delete copy[key];
  return copy;
}

function briefInputs(): FixtureSpec["inputs"] {
  const cases: FixtureSpec["inputs"] = [];
  const norm = (value: Json | undefined) => cases.push({ fn: "normalizeBriefAnswers", input: value === undefined ? {} : { value } });

  // Non-objects -> null. Arrays are objects in JS and normalise to an empty brief.
  for (const value of [null, undefined, "brief", 42, true, false]) norm(value);
  norm([]);
  norm(["Northvale"]);
  norm({});
  norm(COMPLETE_BRIEF);
  // Unknown keys are dropped.
  norm({ brandName: "Acme", extra: "x", __proto__x: "y", BrandName: "wrong case" });
  // Non-string field values become "".
  norm({ brandName: 123, tagline: null, industry: true, offerSummary: ["a"], audiencePrimary: { a: 1 }, audienceSecondary: 0 });
  // Trimming, including whitespace PHP's trim() does not strip by default.
  norm({ brandName: "  Acme  ", tagline: "\t\nTag\r\n", industry: " Retail ", offerSummary: "﻿BOM", audiencePrimary: "　Ideographic　", audienceSecondary: " line ", businessGoals: "   " });
  // Inner whitespace is kept.
  norm({ brandName: "Acme   Co", offerSummary: "Line one\n\nLine two" });
  // Truncation at each field's max: exactly max, max+1, and trimmed before truncation.
  for (const [key, max] of Object.entries(BRIEF_MAX)) {
    norm({ [key]: "a".repeat(max) });
    norm({ [key]: "b".repeat(max + 25) });
    norm({ [key]: `   ${"c".repeat(max)}   ` });
  }
  // Truncation keeps a space left at the cut (no re-trim).
  norm({ brandName: `${"a".repeat(119)} b` });
  // Multibyte: BMP characters count as one; astral (emoji) count as two UTF-16 units.
  norm({ brandName: "é".repeat(130) });
  norm({ brandName: "✓".repeat(121) });
  norm({ brandName: "😀".repeat(61) });
  norm({ brandName: "😀".repeat(60) });
  // Legacy v1 shape.
  norm({ description: "Legacy offer", styleNotes: "Legacy style" });
  norm({ offerSummary: "New offer", description: "Legacy offer", styleDirection: "New style", styleNotes: "Legacy style" });
  norm({ offerSummary: "   ", description: "  Legacy offer  ", styleDirection: "", styleNotes: "Legacy style" });
  norm({ description: "d".repeat(750), styleNotes: "s".repeat(750) });
  norm({ description: 5, styleNotes: null });
  norm({ offerSummary: 7, description: "Legacy used when offerSummary is not a string" });

  const validate = (value: Json | undefined) => cases.push({ fn: "validateBriefSubmission", input: value === undefined ? {} : { value } });
  for (const value of [null, undefined, "brief", 1]) validate(value);
  validate([]);
  validate({});
  validate(COMPLETE_BRIEF);
  // Only required fields present.
  validate(Object.fromEntries(REQUIRED_BRIEF.map((key) => [key, COMPLETE_BRIEF[key]])));
  // Each required field missing, blank, or whitespace-only.
  for (const key of REQUIRED_BRIEF) {
    validate(without(COMPLETE_BRIEF, key));
    validate({ ...COMPLETE_BRIEF, [key]: "   " });
  }
  // Several of the later required fields missing (reported in REQUIRED_FIELDS order).
  validate(without(COMPLETE_BRIEF, "usageContexts", "audiencePrimary", "styleDirection"));
  validate(without(COMPLETE_BRIEF, "audiencePrimary", "businessGoals", "brandPersonality", "styleDirection", "usageContexts"));
  // One of the first three missing hides the other missing fields.
  validate(without(COMPLETE_BRIEF, "brandName", "usageContexts"));
  // Optional fields missing are fine.
  validate(without(COMPLETE_BRIEF, "tagline", "audienceSecondary", "colorPreferences", "mustInclude", "avoidanceNotes", "deliverablesContext", "competitors", "additionalNotes"));
  // Legacy keys satisfy offerSummary / styleDirection.
  validate({ ...without(COMPLETE_BRIEF, "offerSummary", "styleDirection"), description: "Legacy offer", styleNotes: "Legacy style" });
  // Over-long values are truncated, not rejected.
  validate({ ...COMPLETE_BRIEF, brandName: "x".repeat(200) });
  // Non-string required value.
  validate({ ...COMPLETE_BRIEF, industry: 12 });
  return cases;
}

const brief: FixtureSpec = {
  file: "brief.json",
  source: "apps/web/src/lib/brief.ts",
  fns: {
    normalizeBriefAnswers: (i) => normalizeBriefAnswers(arg(i, "value")),
    validateBriefSubmission: (i) => validateBriefSubmission(arg(i, "value")),
  },
  inputs: briefInputs(),
};

// ---------------------------------------------------------------------------
// display-status.json
// ---------------------------------------------------------------------------

function displayStatusInputs(): FixtureSpec["inputs"] {
  const cases: FixtureSpec["inputs"] = [];
  for (const fn of ["deriveDisplayProjectStatus", "deriveOverviewBadgeStatus"]) {
    for (const persistedStatus of [...STATES, "APPROVED", "UNKNOWN", ""]) {
      for (const hasApprovedConcept of [false, true]) {
        for (const hasFinalDeliverable of [false, true]) {
          cases.push({ fn, input: { persistedStatus, hasApprovedConcept, hasFinalDeliverable } });
        }
      }
    }
  }
  return cases;
}

const displayStatus: FixtureSpec = {
  file: "display-status.json",
  source: "apps/web/src/lib/project-status.ts",
  fns: {
    deriveDisplayProjectStatus: (i) => deriveDisplayProjectStatus(i as never),
    deriveOverviewBadgeStatus: (i) => deriveOverviewBadgeStatus(i as never),
  },
  inputs: displayStatusInputs(),
};

// ---------------------------------------------------------------------------
// entitlement-usage.json
// ---------------------------------------------------------------------------

function entitlementInputs(): FixtureSpec["inputs"] {
  const cases: FixtureSpec["inputs"] = [];
  const add = (entitlements: Array<Record<string, Json>>, packageCode: string) =>
    cases.push({ fn: "computeEntitlementUsage", input: { entitlements, packageCode } });

  // No rows: package defaults, unknown package, case sensitivity.
  for (const pkg of ["essential", "professional", "complete", "unknown", "", "Essential"]) add([], pkg);
  // Only unrelated keys: still treated as "no rows".
  add([{ key: "finals", limitInt: 9, consumedInt: 1 }], "complete");
  add([{ key: "finals", limitInt: 9, consumedInt: 1 }], "unknown");
  // Both rows.
  add([{ key: "concepts", limitInt: 3, consumedInt: 1, reservedInt: 0 }, { key: "revisions", limitInt: 2, consumedInt: 0, reservedInt: 1 }], "complete");
  add([{ key: "concepts", limitInt: 3, consumedInt: 5 }, { key: "revisions", limitInt: 2, consumedInt: 1 }], "professional");
  // Null limit = unlimited (limit and remaining 0).
  add([{ key: "concepts", limitInt: null, consumedInt: 7, reservedInt: 2 }, { key: "revisions", limitInt: 0, consumedInt: 4, reservedInt: 1 }], "complete");
  add([{ key: "concepts", limitInt: null, consumedInt: 0 }, { key: "revisions", limitInt: null, consumedInt: 0 }], "essential");
  // Negatives clamped.
  add([{ key: "concepts", limitInt: -2, consumedInt: -1, reservedInt: -3 }, { key: "revisions", limitInt: 2, consumedInt: -5, reservedInt: -1 }], "essential");
  add([{ key: "concepts", limitInt: 5, consumedInt: 2, reservedInt: -4 }], "essential");
  // Reserved counts against remaining; reserved null/absent = 0; over-reserved clamps to 0.
  add([{ key: "revisions", limitInt: 3, consumedInt: 1, reservedInt: 1 }], "complete");
  add([{ key: "revisions", limitInt: 3, consumedInt: 1, reservedInt: null }], "complete");
  add([{ key: "revisions", limitInt: 3, consumedInt: 1, reservedInt: 5 }], "complete");
  add([{ key: "revisions", limitInt: 3, consumedInt: 3, reservedInt: 0 }], "complete");
  // consumedInt null tolerated.
  add([{ key: "concepts", limitInt: 2, consumedInt: null }], "professional");
  // Only one key present: the other stays zero and unconfigured, no package defaults.
  add([{ key: "concepts", limitInt: 2, consumedInt: 1 }], "complete");
  add([{ key: "revisions", limitInt: 2, consumedInt: 1 }], "complete");
  add([{ key: "concepts", limitInt: 2, consumedInt: 1 }, { key: "finals", limitInt: 1, consumedInt: 0 }], "complete");
  // Duplicate keys: the last row wins.
  add([{ key: "concepts", limitInt: 1, consumedInt: 0 }, { key: "concepts", limitInt: 4, consumedInt: 1 }], "essential");
  // Key matching is exact.
  add([{ key: "Concepts", limitInt: 4, consumedInt: 1 }], "professional");
  return cases;
}

const entitlementUsage: FixtureSpec = {
  file: "entitlement-usage.json",
  source: "apps/web/src/lib/entitlements.ts",
  fns: {
    computeEntitlementUsage: (i) => computeEntitlementUsage(arg<EntitlementRow[]>(i, "entitlements"), arg(i, "packageCode")),
  },
  inputs: entitlementInputs(),
};

// ---------------------------------------------------------------------------

const SPECS = [stateMachine, safeNext, brief, displayStatus, entitlementUsage];

function run(spec: FixtureSpec, c: { fn: string; input: Input }): Json {
  const fn = spec.fns[c.fn];
  if (!fn) throw new Error(`${spec.file}: no function ${c.fn}`);
  const result = fn(c.input);
  return result === undefined ? null : toJson(result);
}

function readFixture(spec: FixtureSpec): { source: string; generatedFrom: string; cases: Case[] } {
  return JSON.parse(readFileSync(path.join(fixtureDir, spec.file), "utf8"));
}

if (capture) {
  describe("shared rule fixtures: capture", () => {
    it("writes the fixture files from the live functions", () => {
      const generatedFrom = execSync("git log -1 --format=%H -- .", { cwd: webRoot, encoding: "utf8" }).trim();
      mkdirSync(fixtureDir, { recursive: true });
      for (const spec of SPECS) {
        const cases: Case[] = spec.inputs.map((c) => ({ fn: c.fn, input: toJson(c.input) as Input, expected: run(spec, c) }));
        const body = { source: spec.source, generatedFrom, cases };
        writeFileSync(path.join(fixtureDir, spec.file), `${JSON.stringify(body, null, 2)}\n`);
      }
    });
  });
} else {
  describe.each(SPECS)("shared rule fixture $file", (spec) => {
    it("is current with the authored inputs", () => {
      const fixture = readFixture(spec);
      expect(fixture.source).toBe(spec.source);
      expect(fixture.generatedFrom).toMatch(/^[0-9a-f]{40}$/);
      expect(fixture.cases.map((c) => ({ fn: c.fn, input: c.input }))).toStrictEqual(
        spec.inputs.map((c) => ({ fn: c.fn, input: toJson(c.input) })),
      );
    });

    it("matches the live function for every case", () => {
      const fixture = readFixture(spec);
      const mismatches = fixture.cases
        .map((c, index) => ({ index, fn: c.fn, input: c.input, expected: c.expected, actual: run(spec, c) }))
        .filter((r) => JSON.stringify(r.actual) !== JSON.stringify(r.expected));
      expect(mismatches).toStrictEqual([]);
    });
  });
}
