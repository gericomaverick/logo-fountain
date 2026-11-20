# Story 1.2: Agent guide and project context

**Status:** review (2026-11-20) · **DoD variant:** Laravel-only · **Epic:** 1 · **Covers:** NFR-M2 · **Gate:** `bin/test` (drift check + Pest) · **After:** 1.1a

## Acceptance criteria (epics.md §1.2)
1. **Given** `apps/portal/AGENTS.md`, **then** it lists every architecture §5 rule plus the DoD variants. ✓ (`apps/portal/AGENTS.md` §5, §6)
2. `docs/laravel-migration/project-context.md` exists (BMAD `generate-project-context`). ✓

## Scope (and what's deliberately left out)
- **In:** the full agent guide; `CLAUDE.md` as a pointer; a drift check wired into `bin/test`; the BMAD project context.
- **Out:** runbooks (`apps/portal/docs/`, written by the stories that create each capability); CI wiring of `bin/test` (1.1b); shared tracking files (parent updates them).

## Inventory scope
None (NFR-M2 has no inventory row; no parity tags).

## Next.js source read
None (doc story). Read: `RESUME.md`, `handoff.md`, `epics.md` (Overview DoD, Story 1.2), `architecture.md` (all), `adr/` index, `03-documentation-protocol.md`, `research-technical.md` §1–2, `stories/1-1a-skeleton-compose-pins.md`, `templates/story-conversion-record.md`, `_bmad/bmm/workflows/generate-project-context/` (workflow + 3 steps + template), `apps/portal/{composer.json,package.json,compose.yaml,bin/*,phpstan.neon,pint.json,tsconfig.json,vite.config.ts,phpunit.xml,.npmrc,config/database.php}`.

## Behaviour notes
None (no legacy behaviour is ported).

## Laravel implementation
| Piece | Where |
|---|---|
| Agent guide: Never list, run commands (Docker-only, parallel stacks), DB roles, pins, §5 rules table (one row per Area + ref), DoD variants, §6 map, gotchas, "new pattern → same commit" | `apps/portal/AGENTS.md` (§§0–9) |
| Pointer | `apps/portal/CLAUDE.md` (one line → AGENTS.md) |
| Drift check: §5 Area rows from `architecture.md` and the 3 DoD variants from `epics.md` must appear as first cells of AGENTS.md §5/§6 tables | `apps/portal/bin/check-agents-guide` (POSIX sh + awk, host-side) |
| Gate wiring | `apps/portal/bin/test:5` (runs the check before Pint/Larastan/Pest) |
| BMAD project context | `docs/laravel-migration/project-context.md` (44 rules, 7 sections, template structure from step-03) |

## Deviations from Next.js
None.

## Decisions (for the parent to log)
| Decision | Why |
|---|---|
| `CLAUDE.md` is a one-line pointer, not a copy | One source of truth; a copy would drift and the check only guards AGENTS.md |
| Drift check is a host-side sh/awk script in `bin/`, not a Pest test | `docs/` is outside the app container's bind mount (`compose.yaml` mounts `apps/portal` only), so Pest can't read `architecture.md`. sh/awk needs no Node/PHP on the host |
| Check is structural: each `architecture.md` §5 Area must be the first cell of a row in AGENTS.md §5, each epics.md DoD variant the first cell of a row in AGENTS.md §6 | Simple and honest: adding an Area to the architecture fails `bin/test` until the guide gains the row. It doesn't check rule wording |
| `generate-project-context` run non-interactively (every A/P/C menu answered "C"; no Party Mode/Elicitation); output to `docs/laravel-migration/` instead of `_bmad-output/` | Sub-agent with no user in the loop; `_bmad-output/` is git-ignored (README location note). Nothing written under `_bmad/` |
| project-context.md doesn't repeat the AGENTS.md rules table; it holds the unobvious details (fence SQL, middleware order, mail modes, etc.) | Lean per the workflow's "no redundancy" rule; AGENTS.md is the scannable entry point |
| AGENTS.md uses a `MIG/` alias for `../../docs/laravel-migration/` | Keeps lines short; avoids clashing with the app's own `docs/` runbook folder |

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L0 (doc drift) | `apps/portal/bin/check-agents-guide` | none (NFR-M2) |
Test-port ledger rows resolved: none.

## Test evidence
- Isolated stack `COMPOSE_PROJECT_NAME=lf-1-2` (ports 18082/55512/15172/18022/18332): `docker compose up -d --build` ✓, `/up` **200**.
- `bin/test`: `check-agents-guide: 10 §5 areas and 3 DoD variants present`; Pint ✓ (29 files); Larastan level 9 "No errors"; Pest **5 passed (13 assertions)**.
- Negative check: deleting the `JSON shape` row and the `Conversion` row from a copy of AGENTS.md → exit 1 with `AGENTS.md §5 is missing the rule Area: JSON shape` and `AGENTS.md §6 is missing the DoD variant: Conversion`; restored → pass.
- `docker compose exec vite npm run typecheck` ✓ (verifies the guide's command).
- Stack torn down with `docker compose down -v` (lf-1-2 only).

**Not run, and why:** CI (1.1b doesn't exist yet; when it runs `bin/test` the check needs the repo checkout, which CI has). Parity suite (no endpoints).

## Gotchas
- `awk -v` processes escapes, so a regex `'^## 5\. '` passed with `-v` warns and degrades; use `[.]`. (Script-local, not promoted.)
- The BMAD workflow is interactive (A/P/C menus, "never generate without user input") and its config path says `_bmad/bmm/config.yaml`; the real config is `_bmad/config.yaml`, and its `planning_artifacts` points at the main checkout, not the worktree. Wrote to the worktree path. (Not promoted; AGENTS.md §8 only says when to refresh project-context.)
- `.npmrc` sets `ignore-scripts=true` and `audit=true` but **not** `save-exact`; exact npm pins rely on `npm install --save-exact`. → `AGENTS.md` §4.
- `COMPOSE_PROJECT_NAME` overrides compose.yaml's `name: lf-portal`, so `bin/*` hit the right stack when it's exported. → `AGENTS.md` §2.

## Docs updated
`apps/portal/AGENTS.md`, `apps/portal/CLAUDE.md`, `docs/laravel-migration/project-context.md`, this record. Not touched (parent's): inventory, sprint-status, handoff, DECISIONS/RISKS/ASSUMPTIONS.

## Open items
- Parent: set 1.2 → `done` in `sprint-status.yaml`, update `handoff.md`, log the decisions above.
- 1.1b: make sure CI runs `bin/test` (or `bin/check-agents-guide`) so the drift check gates merges.
- After the 2026-11-23 Inertia bump: update the pin lines in `AGENTS.md` §4 and `project-context.md` (stack).
- Possible extension (not needed now): `RESUME.md` could list `project-context.md` in its orient order.
