# Story 0.6b: Shared rule fixtures

Status: review

## Story

As the delivery team,
I want JSON fixtures for the pure business rules that exist in both TS and PHP, with expected values produced by the Next functions,
so that the PHP ports (stories 2.3, 4.8, 6.5 and the snapshot work) must agree with Next case-for-case.

**Covers:** X-07, A-13, C-05, C-03 · **Gate:** `@unit` · **After:** 0.1 · **DoD variant:** E0 (spec)

## Acceptance criteria

1. `tests/parity/fixtures/rules/` holds `state-machine.json`, `safe-next.json`, `brief.json`, `display-status.json` and `entitlement-usage.json`, each shaped `{source, generatedFrom, cases:[{fn, input, expected}]}`.
2. Inputs are authored to cover every branch. Expected values come from running the Next functions (capture mode), never hand-written.
3. Next's Vitest suite asserts every case still equals the live output, and that the fixture inputs equal the authored inputs (a stale file fails).

## Tasks / subtasks

- [x] `apps/web/src/lib/__tests__/shared-rule-fixtures.test.ts`: authored inputs, `CAPTURE=1` writes the files, normal mode asserts them
- [x] Generate the five fixture files and review the outputs for plausibility
- [x] `tests/parity/README.md`: fixtures row
- [x] Full apps/web unit suite, `npm run check` in tests/parity, and a negative check

## Dev notes

- **Freeze exception (O-09):** the only `apps/web` change is the new test-only file above. No source changes.
- Regenerate: `cd apps/web && CAPTURE=1 npx vitest run src/lib/__tests__/shared-rule-fixtures.test.ts`. `generatedFrom` = `git log -1 --format=%H -- apps/web` at capture time.
- Input conventions, for the PHP harness: `input` is an object of named arguments (`null` for constants). A **missing key means the argument was not passed** (`undefined` in TS), e.g. `applyTransition` without `context`, `safeAuthNextPath` without `fallback`, `normalizeBriefAnswers({})` = `normalizeBriefAnswers(undefined)`.
- Expected values are JSON round-trips: properties that are `undefined` in TS are **absent** (timeline steps without a timestamp have no `timestamp` key; package-default entitlement usage has no `unlimited` key). PHP must omit them, not emit `null`.

## Conversion record

### Inventory scope
X-07 (state machine, labels, CTA, timeline), A-13 (safe `next`), C-05 (brief normalisation and validation), C-03 (display and overview status, entitlement usage).

### Next.js source read
`apps/web/src/lib/project-state-machine.ts:84` (`customerActionFor`), `:137` (`canTransition`), `:142` (`applyTransition`), `:186` (`buildTimeline`); `project-status.ts:9,26`; `auth/safe-next.ts:22` and `safe-next.test.ts` (all cases copied); `brief.ts:320` (`normalizeBriefAnswers`), `:377` (`validateBriefSubmission`); `entitlements.ts:19`. Brownfield: `business-rules-and-notifications.md` §2–§4, §7; `auth-and-security.md` §6.

### Behaviour notes (things a PHP port can easily get wrong)
- `applyTransition` checks in order: invalid state → `INVALID_STATE`; target ON_HOLD with blank reason → `HOLD_REASON_REQUIRED`; target CANCELLED/REFUNDED with blank reason → `REASON_REQUIRED`; then the table → `INVALID_TRANSITION`. So `REFUNDED→ON_HOLD` without a reason is `HOLD_REASON_REQUIRED`, not `INVALID_TRANSITION`. Failures carry `allowed` (the source state's list, `[]` for an invalid source).
- "Blank" uses JS `String.trim()`, which also strips NBSP (` `) and BOM (`﻿`). PHP `trim()` does not. Same for brief trimming (fixture cases include ` `, `﻿`, `　`, ` `/` `).
- Brief truncation counts **UTF-16 code units**: 61 emoji in `brandName` (max 120) keep 60. `mb_substr` would keep all 61.
- Brief arrays are objects in JS: `normalizeBriefAnswers([])` returns an all-empty brief, not `null`. A `validateBriefSubmission` with any of brandName/industry/offerSummary missing reports exactly those three, hiding the others.
- `buildTimeline` with `hasApprovedMilestone:true` at an early state marks the APPROVED step completed while earlier steps are not. That is what Next does, and the fixture records it.
- `safeAuthNextPath`: a mid-path `%2f` (`/foo%2fbar`) is allowed; invalid UTF-8 (`/bad%C3`) and bad escapes (`/%zz`, `/%u002f`) are rejected because `decodeURIComponent` throws (PHP `rawurldecode` does not throw, so the port needs an explicit UTF-8/escape check); `+` is not a space.

### Laravel implementation
None (E0). Consumers: 2.3 (`ProjectState`), 4.8 (safe next), 6.5 (brief), snapshot/display status and entitlements.

### Deviations from Next.js
None.

### Tests
| Layer | Test | IDs |
|---|---|---|
| L1 | `apps/web/src/lib/__tests__/shared-rule-fixtures.test.ts` (10 tests: per file "is current with the authored inputs" and "matches the live function for every case") | X-07, A-13, C-05, C-03 |

Case counts: `state-machine.json` 494 (3 constants, 16 getAllowedTransitions, 133 canTransition, 278 applyTransition, 16 customerActionFor, 48 buildTimeline); `safe-next.json` 91; `brief.json` 104 (73 normalize, 31 validate); `display-status.json` 112 (14 statuses incl. APPROVED, UNKNOWN, "" × 2 × 2, for each of the two functions); `entitlement-usage.json` 24.

### Test evidence (2026-11-18)
- `npm run test` (apps/web): **732 passed, 20 skipped** (baseline 722 + 10 new).
- `npx eslint` on the new file: clean.
- `npm run check` (tests/parity): OK.
- Negative check: changing one `expected` in `safe-next.json` fails "matches the live function"; recapture restores it.

### Gotchas
- The worktree had no `node_modules` or generated Prisma client; both were symlinked (ignored paths) from the main checkout to run the suite.

### Docs updated
`tests/parity/README.md` (fixtures row). The parent updates the inventory, sprint-status, handoff and governance.

### Open items
- Not covered: a brief value whose truncation would split a surrogate pair (TS produces a lone surrogate, which JSON/PHP cannot represent cleanly). Needs an owner/parent decision before it becomes a fixture or a DV.
- Not covered (out of scope): `nextStageCopy`, `missingRequiredFields` with a section, `requiredFieldLabels`, `isKnownProjectState`.
