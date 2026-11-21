# Story 2.3: Project state machine and display status

**Status:** ready-for-dev (2026-11-21) · **DoD variant:** Laravel-only · **Epic:** 2 · **Covers:** X-07, C-03 (status) · **Gate:** `@unit` · **After:** 2.1, 0.6b (done) (stack on `workbench/2.1`; unmerged)

> Created with BMAD `create-story`, from the researcher draft in `reports/story-drafts-60.md` (Workbench), with its `file:line` citations spot-checked against `apps/web` and the docs and corrected (see *Doc / code disagreements*). Structure follows `stories/2-1-schema-migrations-and-roles.md` and `templates/story-conversion-record.md`. Docs only: no portal code was written for this file.

## Story
As the portal, I need a PHP `ProjectState` and display-status derivation that agree with the shared 0.6b fixtures case for case, so that server-side lifecycle decisions and the status the client sees stay exactly as they are in Next.

## Acceptance criteria
From `epics.md:247-249` (§2.3: "The PHP `ProjectState` agrees with every case in the shared fixture"), expanded.

1. **States.** A PHP `ProjectState` covers exactly the 11 persisted states in order: `AWAITING_BRIEF`, `BRIEF_SUBMITTED`, `IN_DESIGN`, `CONCEPTS_READY`, `REVISIONS_IN_PROGRESS`, `AWAITING_APPROVAL`, `FINAL_FILES_READY`, `DELIVERED`, `ON_HOLD`, `CANCELLED`, `REFUNDED` (`project-state-machine.ts:1-13`). `APPROVED` is not a case (display/timeline only, `:17`).
2. **Transitions.** `getAllowedTransitions`, `canTransition` and `applyTransition` equivalents agree with every case of `tests/parity/fixtures/rules/state-machine.json` (16 + 133 + 278 cases), including invalid inputs (`"APPROVED"`, `""`, `"awaiting_brief"`, `" AWAITING_BRIEF"`, `"UNKNOWN"` → `[]` / `false` / `INVALID_STATE`).
3. **`applyTransition` rule order and payload** match `project-state-machine.ts:142-184`: `INVALID_STATE` (either side unknown) → `HOLD_REASON_REQUIRED` (to `ON_HOLD`, blank reason) → `REASON_REQUIRED` (to `CANCELLED`/`REFUNDED`, blank reason) → `INVALID_TRANSITION`; every failure carries `allowed` (the from-state's list); success returns `{ok, from, to, label, primaryCta}`. "Blank" uses JS `trim()` semantics.
4. **Labels, CTAs, customer action, timeline.** `PROJECT_STATE_LABELS`, `PRIMARY_CTA_BY_STATE`, `customerActionFor` (16 cases) and `buildTimeline` (48 cases) agree with the fixture (see *Open questions* 1 for why PHP needs these).
5. **Display and overview status.** `deriveDisplayProjectStatus` and `deriveOverviewBadgeStatus` agree with all 112 cases of `tests/parity/fixtures/rules/display-status.json` (56 each), including persisted `APPROVED`, `""` and `UNKNOWN`.
6. **Unknown persisted status** passes through derivation unchanged (`project-status.ts:23`), as the fixture's `UNKNOWN`/`""` cases pin; it is never coerced to a known state.
7. **No database writes.** Pure domain code; transactions and the version guard belong to 2.4 and the lifecycle Actions.

## Inventory scope
- **X-07** (`01-feature-inventory.md:138`): the 11 states, transition table, timeline labels and CTA. The PHP half completes here (Pest over the shared fixture); the row also lists the TS/UI half (kept) and `@state` parity tests. Mark the Laravel column; `Verified` only if no other part of the row is open.
- **C-03 (status)** (`01-feature-inventory.md:63`): only the status derivation part. C-03 (project hub) stays open for its UI story.
- Test-port ledger: **#103** `project-state-machine.test.ts` (X-07, "Pest unit + keep TS (shared fixture)") and **#104** `project-status.test.ts` (X-07, C-03, "Pest unit") (`test-port-ledger.md:111-112`) → resolved by the fixture-driven Pest tests.

## Next.js source read
- `apps/web/src/lib/project-state-machine.ts` (254 lines): states `:1-13`, `TimelineState` `:17`, `FLOW_STEPS` `:27-37`, labels `:39`, `nextStageCopy` `:77`, `customerActionFor` `:84`, `PRIMARY_CTA_BY_STATE` `:89`, `TRANSITIONS` `:103-126`, `isProjectState` `:128`, `getAllowedTransitions` `:132`, `canTransition` `:137`, `applyTransition` `:142-184`, `buildTimeline` `:186`
- `apps/web/src/lib/project-status.ts` (46 lines): `deriveDisplayProjectStatus` `:9-24`, `deriveOverviewBadgeStatus` `:26-30`, `isKnownProjectState` `:32-46`
- `apps/web/src/lib/project-snapshot.ts:1,309` (server uses `buildTimeline`, labels and CTAs)
- `apps/web/src/lib/__tests__/shared-rule-fixtures.test.ts:61-125` (how the fixtures were generated; `INVALID_STATES` `:64`)
- Fixtures: `tests/parity/fixtures/rules/state-machine.json` (494 cases), `display-status.json` (112 cases), both `generatedFrom` `347ef34`
- Docs: `brownfield/business-rules-and-notifications.md:11-12` (module → Laravel destination), `:22-28` (§2 state machine), `:30` (§3 snapshot); `epics.md:130-132` (0.6b), `:247-249` (2.3)

## Behaviour notes (written before converting)
- Transition table (`project-state-machine.ts:103-126`): every non-terminal state can go to `ON_HOLD`, `CANCELLED`, `REFUNDED` except `DELIVERED` (→ `ON_HOLD`, `REFUNDED`) and `CANCELLED` (→ `REFUNDED`); `REFUNDED` is terminal; `ON_HOLD` can return to any of the 8 flow states or `CANCELLED`/`REFUNDED`. Forward flow: AWAITING_BRIEF → BRIEF_SUBMITTED → {IN_DESIGN, CONCEPTS_READY} …; CONCEPTS_READY → {REVISIONS_IN_PROGRESS, AWAITING_APPROVAL, FINAL_FILES_READY}; REVISIONS_IN_PROGRESS → CONCEPTS_READY.
- `applyTransition` ignores `context.onHoldPreviousState` (accepted, unused). Reason check: `!context?.reason?.trim()`.
- Display (`project-status.ts:9-24`): `DELIVERED`/`FINAL_FILES_READY` are shown only with approved concept **and** final asset; otherwise persisted `APPROVED`/`FINAL_FILES_READY`/`DELIVERED` show `AWAITING_APPROVAL`; approved concept while `CONCEPTS_READY`/`REVISIONS_IN_PROGRESS` → `AWAITING_APPROVAL`; else pass-through. Overview badge (`:26-30`): `APPROVED` when approved, no final, and display is `AWAITING_APPROVAL`.
- ⚠️ F-13: nothing moves a project to `IN_DESIGN` in Next (`business-rules-and-notifications.md:27`). Not this story's to fix; keep the table as is.

## Laravel guidance (for the dev agent)
- Backed string enum `ProjectState` under `app/Domain/` (`AGENTS.md:82` names it there) with `label()`, `primaryCta()`, `allowedTransitions()`; a `ProjectTransitions` service returning a result object for `applyTransition`; a `ProjectStatus` (display/badge) class taking strings, since unknown persisted strings must pass through.
- Use `App\Support\NodeCompat` for JS `trim()` semantics on the reason (it exists for the email mutators; `2-1-…md:185`).
- Tests read the JSON fixtures directly (no copies) and dispatch on `fn`; one Pest dataset per fixture file so a new fixture case fails loudly if unhandled.

## Planned deviations from Next.js (confirm in the Conversion record)
| Behaviour | Next.js | Laravel | Why | Ref |
|---|---|---|---|---|
| State type | TS `as const` array + string union | PHP backed enum + service | Laravel convention | brownfield `:11`, owner rule |
None visible to the parity suite (the fixture pins outputs).

## Tasks
1. Read both fixtures and `shared-rule-fixtures.test.ts`; list each `fn` and its input/expected shape.
2. Enum + transitions service (AC 1–3).
3. Labels, CTAs, `customerActionFor`, `buildTimeline` (AC 4).
4. Display/badge derivation (AC 5–6).
5. Fixture-driven Pest tests (`->group('unit')`), plus explicit edge cases named below.
6. Docs: Conversion record; inventory X-07 / C-03 Laravel/Tests columns; ledger #103/#104; DECISIONS line for the enum form if not already covered.

## Test plan
| Layer | File | Cases | IDs |
|---|---|---|---|
| L1 Pest `@unit` | `tests/Unit/Domain/ProjectStateFixtureTest.php` | all 494 `state-machine.json` cases, by `fn` | X-07 |
| L1 Pest `@unit` | `tests/Unit/Domain/ProjectStatusFixtureTest.php` | all 112 `display-status.json` cases | X-07, C-03 |
| L1 Pest `@unit` | `tests/Unit/Domain/ProjectStateEdgeTest.php` | rule order (unknown + blank reason → `INVALID_STATE`); reason of only Unicode whitespace (e.g. `"\u{00A0}"`) counts as blank (JS trim); `APPROVED` not an enum case; fixture `fn` coverage (every `fn` in the file is handled) | X-07 |
No parity runs (`@state` parity journeys belong to the UI stories).

## Definition of done (Laravel-only, `epics.md:35`)
`@unit` group green, plus the full Laravel suite (`bin/test`). Ledger #103/#104 resolved; inventory columns updated. Story record, handoff, pushed (branch).

## Dependencies and follow-ups
- **Depends on:** 0.6b fixtures (done); 2.1 only for the branch base (no schema use beyond `projects.status` text, `2-1-…md:186`).
- **2.4 / lifecycle Actions** call the transitions service inside `Db::serializable()`.
- **Snapshot builder** (`project-snapshot.ts` → PHP `ProjectSnapshot`, a later story) consumes display status and `buildTimeline`.

## Open questions (with recommendations)
1. **Does PHP need labels, CTAs and the timeline?** Brownfield says labels, CTAs and `buildTimeline` "are UI copy … They stay in TS" (`business-rules-and-notifications.md:28`), but `applyTransition` returns `label` and `primaryCta`, and the server snapshot calls `buildTimeline` (`project-snapshot.ts:1,309`), so the Laravel API must produce them. *Recommendation:* port all 8 `fn`s of the fixture to PHP (data-driven, cheap) and keep the TS copies for the UI; both are pinned by the same fixture so they can't drift.
2. **Enum vs class.** *Recommendation:* backed string enum plus a separate transitions service (brownfield `:11` says "PHP enum + transition service").
3. **Unknown status.** *Recommendation:* pass through unchanged, as the fixture pins; `ProjectState::tryFrom()` returns null and derivation works on the raw string.
No owner decision needed for 2.3.

## Doc / code disagreements and citation fixes
- Draft cited `epics.md:119-122` for story 0.6b; it is at `epics.md:130-132` (119-122 is 0.4/0.5). Fixed.
- Draft cited `business-rules-and-notifications.md:22-29` for §2; §2 is `:22-28` (`:30` is the §3 snapshot heading). Fixed.
- Brownfield `:28` ("stay in TS") vs `project-snapshot.ts:309` (server-side timeline): see *Open questions* 1.
- The fixture covers persisted `APPROVED` though it is not a state (legacy rows); keep the derivation handling it.

---

## Conversion record
(Filled in by the dev agent; see `templates/story-conversion-record.md`. Write "none" rather than leaving a section out.)

### Laravel implementation

### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|

Test-port ledger rows resolved:

### Test evidence
**Not run, and why:**

### Gotchas

### Docs updated

### Open items
