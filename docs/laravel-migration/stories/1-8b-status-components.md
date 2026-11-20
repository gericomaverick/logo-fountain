# Story 1.8b: Status components

**Status:** review (2026-11-20) · **DoD variant:** Laravel-only · **Epic:** 1 · **Covers:** UX §2.5, §11 · **Gate:** `@visual` · **After:** 1.8a
**Branch:** `worktree-agent-aec97c0a1960dcb14` (not pushed) · **Stack:** `COMPOSE_PROJECT_NAME=lf-1-8b`, HTTP 18091, Vite 15181

## Acceptance criteria (epics.md §1.8b)
Turn banner (5 turns plus celebration), Status pill, Stage tracker (horizontal and vertical, terminal states), Allowance meter (used, in progress, left, unlimited), Empty state, Skeleton. ✓ All built, in `/dev/ui/status`, both themes, axe clean.

## Components vs the UX §11 list
Location: `apps/portal/resources/js/Components/ui/` (AGENTS.md §7 and UX §11 both say `Components/ui`; there is no `Components/status`). Logic: `resources/js/lib/status.ts`.

| §11 item | Variants and states built | File |
|---|---|---|
| Turn banner | your turn · designer's turn · done · paused · closed (one per state, 11) + celebration (first concepts, approved, final files); one primary action slot; paused → "Check messages" link; polite announcement when the turn changes after load | `TurnBanner.tsx` |
| Status pill | the 5 turns, for all 11 states; text + Lucide icon; closed says Cancelled / Refunded | `StatusPill.tsx` |
| Stage tracker | horizontal · vertical · responsive (vertical < md, horizontal ≥ md); done / current / upcoming (glyph + hidden text + `aria-current="step"`); approved milestone; terminal on hold / cancelled / refunded (stop marker); dates as `<time>` | `StageTracker.tsx` |
| Allowance meter | used / in progress / left segments (≤ 12 slots), proportional bar (> 12), unlimited (no bar), none left, limit below usage ("N over the limit") | `AllowanceMeter.tsx` |
| Empty state | per context: title, what appears and when, optional icon and action | `EmptyState.tsx` |
| Skeleton | list · card · image, count 1–8, one `role=status` "Loading X…" | `Skeleton.tsx` |

## State mapping used (no new states)
States = Next `PROJECT_STATES` (asserted equal to Next's output). Turn per UX §2.5, cross-checked with Next `customerActionFor`:

| Turn | States | Pill |
|---|---|---|
| your-turn | AWAITING_BRIEF, CONCEPTS_READY, FINAL_FILES_READY | Your turn |
| designers-turn | BRIEF_SUBMITTED, IN_DESIGN, REVISIONS_IN_PROGRESS, AWAITING_APPROVAL | With your designer |
| done | DELIVERED | Complete |
| paused | ON_HOLD | Paused |
| closed | CANCELLED, REFUNDED | Cancelled / Refunded |
| (unknown string) | → designers-turn (never asks the customer to act) | With your designer |

Stages = Next `buildTimeline()` ported value for value (`lib/status.ts`): 9 steps (8 flow states + the `APPROVED` milestone); ON_HOLD/CANCELLED/REFUNDED append a terminal item and mark no step done. Celebrations: first-concepts → CONCEPTS_READY, approved → AWAITING_APPROVAL, final-files → FINAL_FILES_READY.

## Inventory scope
No row completed (design-system work, DV-UX). C-19 (frame/nav/badges) remains with 1.9 and Epic 6. Proposed Tests-column addition below.

## Next.js source read
`apps/web/src/lib/project-state-machine.ts` (PROJECT_STATES, labels, `customerActionFor`, `buildTimeline`), `project-state-machine.test.ts`, `src/components/allowances.tsx` (`resolveUsage`, segment ≤ 12 rule), `src/lib/entitlements.ts` (`computeEntitlementUsage`). Docs: epics 1.8a–1.9, UX §2.5, §7, §8, §11–§13, `ux/design-directions.html` (A), ADR-022, 02-test-strategy L7/L7a/L7b, brownfield `business-rules-and-notifications.md` (entitlements), `api-admin.md` (limits may be set below usage, null = unlimited), 1.8a record, AGENTS.md §8.

## Behaviour notes
- Turn: §2.5 table (above). Copy: §2.5/§7 lines; designer's-turn bodies start "Nothing needed from you."; no internal names, no turnaround promises (owner item §15.2) — unit-tested.
- Timeline: Next `buildTimeline(state, timestamps, {hasApprovedMilestone})`; unknown state → AWAITING_BRIEF; `APPROVED` string → AWAITING_APPROVAL with the approved milestone current; approved step's timestamp = AWAITING_APPROVAL's.
- Allowance: consumed = used, reserved = in progress; left = max(limit − consumed − reserved, 0); everything clamps ≥ 0; null limit = unlimited; limits may be lower than usage (no guard in Next) → slots fill used first, overage counted.

## Laravel implementation
| Piece | Where |
|---|---|
| Pure logic: states, `turnFor`, `pillLabel`, `BANNER_COPY`, `CELEBRATION_COPY`, `buildTimeline`, `trackerModel`, `stepStatusText`, `formatDate` (en-GB, Europe/London), `allowanceView`, `skeletonRows` | `resources/js/lib/status.ts` |
| Components | `resources/js/Components/ui/{TurnBanner,StatusPill,StageTracker,AllowanceMeter,EmptyState,Skeleton}.tsx` |
| "In progress" stripes utility `bg-stripes-in-progress` (built from colour tokens, so in the token file) | `resources/css/app.css` (end) |
| Catalogue page `Dev/UiStatus` | `resources/js/Pages/Dev/UiStatus.tsx` |
| Route `/dev/ui/status` (`dev.ui.status`), inside the local/testing block | `routes/web.php` |
| Design lint: `TurnBanner.tsx` added to `DISPLAY_TITLE_CALLERS` (celebration = UX §8.2 use 3) | `scripts/design-lint.mjs:22-27` |
| Sfizia preload on `Dev/UiStatus` | `config/ui.php` `display_font_pages` |

**Catalogue URLs:** `/dev/ui` (1.8a, unchanged, no link added) and `/dev/ui/status` (this story). Locally: http://localhost:18091/dev/ui/status on this stack.

No new dependencies (Lucide icons from the 1.8a pin: CircleArrowRight, Hourglass, CircleCheck, CirclePause, CircleSlash2, Circle, CircleDot, Sparkles, Inbox, MessageSquare, FileArchive).

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Status colours | per-stage colours | 5 turn tones only | UX §2.5 drops stage colours | DV-UX |
| Pill/banner copy | `PROJECT_STATE_LABELS`, `PRIMARY_CTA_BY_STATE` | turn label + §2.5 copy; action labels "Start your brief", "Review concepts", "Download ZIP" | UX §2.5, §7 | DV-UX |
| Tracker timestamps | (timeline list) | shown as text under each step, not on hover/tap only | UX §13 "no content relies on hover"; no tooltip primitive yet | DV-UX (proposal below) |
| Allowance tone chip ("Available/Last one/Used up") | shown | not shown; headline "N left"/"None left" + legend | UX §11 asks for big number + bar + legend | DV-UX |
| "Not configured" chip (admin, package defaults) | shown | not built | admin properties panel's concern (1.8c/Epic 7) | open item |

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 node:test | `tests/js/status-logic.test.ts` (26): states = Next's; §2.5 turn table; your-turn ⇔ Next `customerActionFor`; unknown → designer's turn; pill labels; copy completeness, "Nothing needed from you", no internal names / no turnaround times; celebrations; **`buildTimeline` equals Next's output for all 84 reference cases (14 inputs incl. APPROVED and unknown × with/without timestamps × 3 option sets)** (`tests/js/fixtures/next-timeline.json`, generated by running `apps/web/src/lib/project-state-machine.ts` in node:24); trackerModel (flow, approved, terminal); status text; dates (BST/GMT); allowance maths (segments, bar, unlimited, singular, over-limit, clamping, exhaustive `left` vs Next formula); skeleton rows | NFR-A1 |
| L1 node:test | `tests/js/contrast.test.ts` "story 1.8b status component pairs" (26): fg-2 on accent/success/warning-soft, accent-text on warning-soft, fg on sunken, tracker glyphs (warning, fg-2, accent) on bg/surface, meter segments (fg-3, accent, border on surface), sparkle | NFR-A1, NFR-A4 |
| L2 Pest | `tests/Feature/DevUiRouteTest.php`: `/dev/ui/status` renders `Dev/UiStatus` with 2 font preloads; production `route:list` lacks `dev/ui/status`; local has it | none |
| L7 `@visual` | `tests/browser/ui-status.spec.ts`: full page + 3 celebration banners × light/dark × desktop/phone = **16 baselines** in `tests/browser/__screenshots__/ui-status.spec.ts/` | NFR-A4 |
| L7a `@visual` | same: axe on the page and on each celebration, both themes | NFR-A1 |
| L7 behaviour `@visual` | pills text+icon+turn for all 11 states; banners (counts, one primary per your-turn banner, paused link, no actions on done/closed); turn change announced, first render not; celebration = only display line, Sfizia, h2, ≥ 32/28 px, weight 400, preloaded; tracker one `aria-current` each, hidden status text, `<time>`; terminal markers; responsive direction; meter legend/img name/segments/unlimited/bar/over-limit; empty states; skeleton status text; **skeleton motion: single fade-in, no descendant animation, `animation-name: none` under `prefers-reduced-motion: reduce`**; one h1 | NFR-A1, NFR-A2 |
Test-port ledger rows resolved: none.

## Test evidence
Stack `lf-1-8b`, commit `5b2fa99`.
- `bin/ui-test`: design lint **clean**; node:test **150 passed / 0 failed** (98 before + 26 logic + 26 pairs); `tsc --noEmit` ✓.
- `bin/test`: check-agents-guide ✓, Pint ✓, Larastan level 9 ✓, Pest **316 passed (905 assertions)**.
- `PORTAL_HTTP_PORT=18091 bin/browser-test`: **144 passed / 0 failed** (1.8a's 96 + this story's 48), **without** `--update-snapshots`: 1.8a's 32 baselines unchanged. `ui-status.spec.ts --repeat-each=3`: **144 / 144**.

**Not run, and why:** parity suite (no behavioural change; Laravel-only gate). Production build run of the browser tests (1.8a showed parity with dev; not repeated). CI (`ui` job is 1.9). Manual screen-reader passes (before launch, UX §13).

## Gotchas
- The design lint's `display-font` rule matches the word "Sfizia" in **comments** too; write "display font" in comments outside DisplayTitle.
- A new DisplayTitle caller that is a component (not a page) puts Sfizia on every page that renders it: the lint allowlist names the component file, but the preload list (`config/ui.php`) must name the **pages** (here `Dev/UiStatus`; Epic 6 must add the customer Overview page).
- Horizontal trackers with 9 steps need ~48rem; the catalogue wraps them in a focusable scroll region on phones (axe `scrollable-region-focusable`). Screens should use `orientation="responsive"`.
- `motion-safe:animate-fade-in` gives `animation-name: none` under reduced motion (stronger than the base layer's 0.01 ms clamp), which makes the reduced-motion check exact.

## Proposed AGENTS.md promotions (for the parent)
1. Project status UI derives from the state through `lib/status.ts` (`turnFor`, `bannerCopy`, `buildTimeline`, `allowanceView`); never pick a status colour or label by hand in a screen.
2. Sfizia in a celebration comes only through `<TurnBanner celebration=…>`; a page that shows one must be in `config/ui.php` `display_font_pages`.
3. Skeletons don't animate beyond a one-off fade-in (UX §8.3: no looping animation).
4. Each catalogue area has its own page and spec (`/dev/ui`, `/dev/ui/status`, `/dev/ui/media`) so baselines don't clash.

## Proposed UX spec changes (for the parent / owner)
- §11 Stage tracker: "timestamps shown under each step" instead of "on hover or tap" (§13 no hover-only content). Or a Tooltip primitive later.
- §11 Status pill: name the designer's-turn label ("With your designer") and closed ("Cancelled"/"Refunded").
- §11 Skeleton: state "static, single fade-in; no shimmer/pulse" (follows from §8.3).
- §8.1 addendum: the 1.8b pairs in `contrast.test.ts` (all pass AA both themes).
- §2.5/§7 copy in `lib/status.ts BANNER_COPY` for owner review (and §15.2 turnaround times to add when agreed).

## Proposed inventory status (for the parent)
- C-19: Tests column add `apps/portal/tests/browser/ui-status.spec.ts`, `tests/js/status-logic.test.ts`; Laravel column add "status components + /dev/ui/status (1.8b)". Status unchanged.

## Proposed decisions / risks / assumptions (for the parent)
- DECISION: Turn/stage logic lives client-side in `lib/status.ts`; `buildTimeline` is a faithful port, pinned by a fixture generated from Next. Epic 6 may still compute `timeline[]` on the server for the snapshot JSON; `StageTracker` accepts that shape directly.
- DECISION: unknown project state → designer's turn (never asks the customer to act).
- DECISION: `/dev/ui/status` is a separate catalogue page with its own baselines; `config/ui.php` preloads Sfizia there.
- ASSUMPTION: banner/pill copy in `BANNER_COPY` is acceptable until owner review; no turnaround times promised.
- RISK (low): `tests/js/fixtures/next-timeline.json` is a snapshot of frozen `apps/web`; if apps/web's timeline changes (needs a parity test per the freeze rule), regenerate it (story record "Tests").

## Docs updated
This story record. Shared tracking files left to the parent per instructions.

## Open items
- Epic 6 (Overview): add the Overview page to `config/ui.php` `display_font_pages`; decide "one-time" celebration persistence; wire turn banner actions to real routes.
- 1.8c / Epic 7: admin "Not configured" allowance hint (package defaults) in the properties panel.
- 1.9: run `ui-status.spec.ts` in the CI `ui` job (16 baselines).
- Owner: approve banner copy and the tracker timestamp wording.
