# Story 2.3: Project state machine and display status

**Status:** review (2026-11-22, branch `workbench/2-3-state`, stacked on `workbench/schema` `4e323ee`) · **DoD variant:** Laravel-only · **Epic:** 2 · **Covers:** X-07, C-03 (status) · **Gate:** `@unit` · **After:** 2.1, 0.6b (done) (stack on `workbench/schema`, the 2.1 builder's branch; unmerged)

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
7. **No database writes.** Pure domain code; transactions and the version guard belong to 2.4 and the lifecycle Actions. → arch test: the 2.3 classes don't use `Illuminate\Support\Facades\DB`, `Illuminate\Database`, or `App\Models`.
8. **The tests read the shared fixtures in place.** The `app` container mounts only `apps/portal` (`apps/portal/compose.yaml:15`, `.:/var/www/html`), so `tests/parity/fixtures/rules/` is added as a **read-only bind mount** in `apps/portal/compose.yaml` (e.g. `../../tests/parity/fixtures/rules:/var/www/parity-fixtures/rules:ro`, outside `/var/www/html` so no empty mountpoint appears in the portal tree). This covers `bin/test`, builder stacks and CI, which run the same compose file from `apps/portal` with the whole repo checked out (`.github/workflows/portal.yml:23,41`). If the directory is missing, the fixture tests **fail** with a message naming the mount; they never skip. No copy is made, so there is nothing to drift.

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
- Backed string enum `ProjectState` under `app/Domain/` (`AGENTS.md` §7 names it there: the *Value objects, enums* row, line 83 on main `b115b95`) with `label()`, `primaryCta()`, `allowedTransitions()`; a `ProjectTransitions` service returning a result object for `applyTransition`; a `ProjectStatus` (display/badge) class taking strings, since unknown persisted strings must pass through.
- Blank reason: use `NodeCompat::trimEnv()` (`apps/portal/app/Support/NodeCompat.php:45`), which is the JS `trim()` set for UTF-8 strings (`UNICODE_SPACE`, `:19`). There is no `NodeCompat::trim()`; `trimHeader()` is the latin1 variant for headers and is wrong here. Don't add a new method in this story (2.2 uses `trimEnv` for its email mutators too); if the name reads badly at the call site, say so in the record.
- Tests read the JSON fixtures in place through the AC 8 mount (no copies) and dispatch on `fn`; one Pest dataset per fixture file so a new fixture case fails loudly if unhandled. Keep the fixture path in one place (a test helper constant), as `apps/portal/tests/js/status-logic.test.ts:34` does for its own fixture.

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
5. Fixture mount (AC 8): `apps/portal/compose.yaml` volume on the shared app definition; confirm `.github/workflows/portal.yml` needs no change (it runs the same compose file) and say so in the record. Builder stacks pick it up on `docker compose up -d` (recreate `app`).
6. Fixture-driven Pest tests (`->group('unit')`), plus explicit edge cases and the AC 7 arch test named below.
7. Docs: Conversion record; inventory X-07 / C-03 Laravel/Tests columns; ledger #103/#104; DECISIONS line for the enum form if not already covered.

## Test plan
| Layer | File | Cases | IDs |
|---|---|---|---|
| L1 Pest `@unit` | `tests/Unit/Domain/ProjectStateFixtureTest.php` | all 494 `state-machine.json` cases, by `fn` | X-07 |
| L1 Pest `@unit` | `tests/Unit/Domain/ProjectStatusFixtureTest.php` | all 112 `display-status.json` cases | X-07, C-03 |
| L1 Pest `@unit` | `tests/Unit/Domain/ProjectStateEdgeTest.php` | rule order (unknown + blank reason → `INVALID_STATE`); reason of only Unicode whitespace (e.g. `"\u{00A0}"`) counts as blank (JS trim); `APPROVED` not an enum case; fixture `fn` coverage (every `fn` in the file is handled); missing fixture directory → failure naming the mount, not a skip | X-07 |
| Arch | `tests/Arch/DomainPurityTest.php` (or a case in an existing arch file) | `ProjectState`, the transitions service and `ProjectStatus` don't use `DB`, `Illuminate\Database` or `App\Models` (AC 7) | X-07 |
No parity runs (`@state` parity journeys belong to the UI stories).

## Definition of done (Laravel-only, `epics.md:35`)
`@unit` group green, plus the full Laravel suite (`bin/test`). Ledger #103/#104 resolved; inventory columns updated. Story record, handoff, pushed (branch).

## Dependencies and follow-ups
- **Depends on:** 0.6b fixtures (done); 2.1 only for the branch base (no schema use beyond `projects.status` text, `2-1-…md:186`). Stack on `workbench/schema` (the 2.1 builder's branch); rebase if 2.1 changes.
- **2.4 / lifecycle Actions** call the transitions service inside `Db::serializable()`.
- **Snapshot builder** (`project-snapshot.ts` → PHP `ProjectSnapshot`, a later story) consumes display status and `buildTimeline`.

## Open questions (with recommendations)
1. **Does PHP need labels, CTAs and the timeline?** Brownfield says labels, CTAs and `buildTimeline` "are UI copy … They stay in TS" (`business-rules-and-notifications.md:28`), but `applyTransition` returns `label` and `primaryCta`, and the server snapshot calls `buildTimeline` (`project-snapshot.ts:1,309`), so the Laravel API must produce them. *Recommendation:* port all 8 `fn`s of the fixture to PHP (data-driven, cheap) and keep the TS copies for the UI. They are pinned by **different** fixtures that come from the same Next code: the PHP port by `tests/parity/fixtures/rules/state-machine.json`, the portal's `resources/js/lib/status.ts` by `apps/portal/tests/js/fixtures/next-timeline.json` (1.8b, generated from Next's own `buildTimeline()`/`customerActionFor()`, `tests/js/status-logic.test.ts:2-4`). Both agree with Next, so they agree with each other; neither test checks the other's fixture.
2. **Enum vs class.** *Recommendation:* backed string enum plus a separate transitions service (brownfield `:11` says "PHP enum + transition service").
3. **Unknown status.** *Recommendation:* pass through unchanged, as the fixture pins; `ProjectState::tryFrom()` returns null and derivation works on the raw string.
No owner decision needed for 2.3.

## Doc / code disagreements and citation fixes
- Draft cited `epics.md:119-122` for story 0.6b; it is at `epics.md:130-132` (119-122 is 0.4/0.5). Fixed.
- Draft cited `business-rules-and-notifications.md:22-29` for §2; §2 is `:22-28` (`:30` is the §3 snapshot heading). Fixed.
- Brownfield `:28` ("stay in TS") vs `project-snapshot.ts:309` (server-side timeline): see *Open questions* 1.
- The fixture covers persisted `APPROVED` though it is not a state (legacy rows); keep the derivation handling it.
- Earlier draft of this story said the tests could read `tests/parity/fixtures/rules/*.json` directly; the container can't see that path (`compose.yaml:15`). Fixed by AC 8 (read-only mount). It also said `NodeCompat` had a JS `trim()` for the email mutators; it has `trimEnv`/`trimHeader`/`lower` and the mutators don't exist yet (2.2). Fixed. AGENTS.md citation was `:82`; the `app/Domain/` row is line 83 on main. Now cited by section.

---

## Conversion record
(Filled in by the dev agent; see `templates/story-conversion-record.md`. Write "none" rather than leaving a section out.)

### Laravel implementation
Branch `workbench/2-3-state` (Workbench builder "2-3-state"), forked from `workbench/schema` at `4e323ee` (2.1 at review, unmerged; it is based on main `129a599`, so main's later docs commits `9c94d6f`…`b4b151c` are not on this branch). Merge after 2.1. All under `apps/portal/`:
- `app/Domain/ProjectState.php`: backed string enum, the 11 states in Next's order; `label()`, `primaryCta()`, `customerAction()` (CTA only for AWAITING_BRIEF / CONCEPTS_READY / FINAL_FILES_READY), `allowedTransitions()` (Next's table and order), `canTransitionTo()`, `requiresReason()`, `flow()` (the 8 flow states). `APPROVED` is not a case; unknown strings → `tryFrom()` null (exact, case-sensitive).
- `app/Domain/ProjectTransitions.php`: `allowedFrom(string)`, `can(string, string)`, `apply(string $current, string $next, ?string $reason)` with Next's rule order (INVALID_STATE → HOLD_REASON_REQUIRED → REASON_REQUIRED → INVALID_TRANSITION). Blank = `NodeCompat::trimEnv($reason ?? '') === ''` (JS `trim()` set). The name `trimEnv` reads oddly here (a reason isn't an env value) but is the right function; no new method added, as the story says.
- `app/Domain/ProjectTransition.php` (readonly result: `ok()`, `from`, `to`, `error`, `allowed`; `toArray()` gives Next's JSON shape and key order) and `app/Domain/ProjectTransitionError.php` (backed enum of the 4 error strings).
- `app/Domain/ProjectTimeline.php`: `build(string $currentState, array $timestamps = [], bool $hasApprovedMilestone = false)`; the `timestamp` key is omitted when absent (Next's `undefined`), kept when it is `""`.
- `app/Domain/ProjectStatus.php`: `display()` and `overviewBadge()` over raw strings (unknown values pass through).
- `compose.yaml`: read-only bind mount `../../tests/parity/fixtures/rules:/var/www/parity-fixtures/rules:ro` on the shared `x-php` definition (init, app, worker). `.github/workflows/portal.yml` needs **no change**: it checks out the whole repo and runs the same compose file from `apps/portal` (`docker compose up -d --build … app …`, `portal.yml:41`). No other compose file mounts the portal (grep of `tests/parity` and `.github`).
- `tests/Support/ParityFixture.php`: the one place the fixture path lives (`RULES_DIR`); throws, naming the mount, if the directory or file is missing (never skips).
Not ported (not in the fixture, UI copy only): `nextStageCopy` (`project-state-machine.ts:77`) and `isKnownProjectState` (`project-status.ts:32`, = `ProjectState::tryFrom() !== null`).

### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| State type | TS `as const` array + string union, `TRANSITIONS` record | Backed enum with methods + static `ProjectTransitions` service + readonly result object | Laravel convention (brownfield `:11`, owner rule) | DECISIONS 2026-11-22 (2.3) |
| `applyTransition` context | `context?: {reason, onHoldPreviousState}` | `?string $reason` only | `onHoldPreviousState` is accepted but never read in Next (fixture case pins it as ignored) | same |
| `customerActionFor(state)` | function over `string | null | undefined` | `ProjectState::tryFrom($s)?->customerAction()` | enum method; same output for all 16 fixture cases | same |
None visible to the parity suite: the fixture pins every output.

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 Pest `unit` | `tests/Unit/Domain/ProjectStateFixtureTest.php`: "agrees with the Next state machine" (one dataset row per case, all 494 of `state-machine.json`); "handles every fn in state-machine.json, and only those" | X-07 |
| L1 Pest `unit` | `tests/Unit/Domain/ProjectStatusFixtureTest.php`: "agrees with the Next display status" (all 112 of `display-status.json`); "handles every fn in display-status.json, and only those" | X-07, C-03 |
| L1 Pest `unit` | `tests/Unit/Domain/ProjectStateEdgeTest.php`: 11 states / APPROVED and near-misses not states; unknown state before reason rules; JS-trim blank reason (NBSP, U+3000, U+2028+BOM, \f\v blank; NEL, NUL, U+200B not blank); refusal/success payload; unknown persisted statuses pass through; timeline timestamp omitted only when absent; missing fixture directory → RuntimeException naming the mount (16 tests) | X-07 |
| Arch | `tests/Arch/DomainPurityTest.php`: "<Class> never touches the database or models", one per class (6): no `Illuminate\Support\Facades\DB`, `Illuminate\Database`, `App\Models` (AC 7) | X-07 |

Test-port ledger rows resolved: **#103** (Pest half; the keep-TS half is the 1.8b portal `status.ts`), **#104**.

### Test evidence
Stack `lf-wb5` (this copy's own; fresh `docker compose up -d --build`), 2026-11-22:
- `bin/test` (agents-guide check, Pint `--test`, Larastan level 9, Pest all suites): **1033 passed** (2585 assertions), 0 failed; Larastan "No errors". 2.1's 403 + 630 new.
- `pest tests/Unit/Domain tests/Arch/DomainPurityTest.php`: 630 passed. `pest --group=unit`: 624 passed (the 6 arch tests aren't in the `unit` group).
- **The tests can fail** (checked by hand, then reverted): adding `CANCELLED` to DELIVERED's transitions failed fixture rows and the edge test; adding a `DB::table()` call to `ProjectStatus` and a `User::query()` to `ProjectState` failed exactly those two arch tests.
**Not run, and why:** `bin/ui-test` / `bin/browser-test` (no UI or TS change); parity suite (no `@state` journeys in scope; Next stack not installed on this Mac); CI (no PR/dispatch from a builder). No separate fresh-volume run beyond the one above (no schema or role change).

### Gotchas
- **Pest arch with an array of targets missed a violation:** `arch()->expect([A::class, B::class])->not->toUse([...])` passed while `B` called `DB::table()`; a single target fails as it should. One expectation per class (`DomainPurityTest.php`). Added to `AGENTS.md` §8.
- The fixtures live outside the bind-mounted app tree; the container sees them only through the `x-php` mount. A stack created before this branch needs `docker compose up -d --force-recreate app` (or `up -d`, which recreates on a compose change).
- `assertSame`-style `toBe` on decoded JSON arrays is key-order sensitive, so `toArray()`/`build()` emit keys in Next's order (also what the later snapshot contract wants).

### Docs updated
Inventory X-07 (Laravel column, PHP half) and C-03 (status derivation note); ledger #103/#104; `sprint-status.yaml` → review; DECISIONS, RISKS, ASSUMPTIONS one line each (2026-11-22); `apps/portal/AGENTS.md` §8 (two gotchas: arch array targets; shared fixtures via `ParityFixture`); `handoff.md` session log line. `project-context.md` not refreshed (two gotcha lines, not material).
Story-docs critic (`reports/story-docs-critic-1915.md`, re-check at `1be9c96`): its four remaining minor points concern 2.4 and 2.5 only (AC7 `{}` default, fixed-window start, two payload sources, harness trait names, stale wording); none applies to 2.3, so no change to this story's text. Its B1 (2.3 fixture access) was already fixed in the story and is implemented as AC 8 here.

### Open items
- **X-07 not Verified:** the `@state` parity journeys (j12–j18) and the UI half belong to later stories. C-03 stays open for the project hub UI.
- **Snapshot story:** `ProjectTimeline::build()` takes ISO timestamp strings; formatting dates (ms, `Z`) is the snapshot builder's job (ASSUMPTIONS 2026-11-22).
- **Rebase** if 2.1 changes in review (this branch touches no 2.1 file except `compose.yaml`'s volume list).
- F-13 (nothing moves a project to `IN_DESIGN`) unchanged, as the story says.
