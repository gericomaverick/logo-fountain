# Laravel migration: start here

This folder holds the BMAD plan for moving the portal app (`apps/web`, Next.js) to Laravel.
The marketing site (`apps/site`, Eleventy) is **out of scope** and stays as it is.

**New session or agent? Start with [`RESUME.md`](RESUME.md)** (the restart checklist), then read these in order:

1. `handoff.md`: where the work is right now, what's next and what's blocking it. **Always current.**
2. `00-migration-plan.md`: goal, constraints, BMAD phase sequence, epics, gates, open decisions.
3. `01-feature-inventory.md`: every feature that must exist in Laravel, with IDs and parity status.
4. `02-test-strategy.md`: how each converted piece is proven to work end to end.
5. `03-documentation-protocol.md`: what you must write down as you work, and where.
6. `brownfield/index.md` and the brownfield doc for the area you're converting. **Read the old behaviour before writing the new.**
7. The BMAD story file for the story you are working on (in `docs/laravel-migration/stories/`).

**Location note:** `_bmad-output/` is git-ignored in this repo, so BMAD would normally write there and nothing would survive between agents. For this migration, every BMAD output (brief, PRD, architecture, epics, story files, `sprint-status.yaml`) is written to **`docs/laravel-migration/`**, with story files in `stories/`. When you run a BMAD workflow, override its output path to this folder.

**BMAD config resolution (phase 4).** The phase-4 workflow files declare `config_source: {project-root}/_bmad/bmm/config.yaml`, but `_bmad/bmm` is a **symlink to the shared BMAD plugin** (`~/.openclaw/extensions/bmad-method/…` on the old Linux box; **on the Mac, from 2026-11-21, the symlinks dangle**: there is no BMAD install here, so agents follow the existing story files and `templates/` for each BMAD step). **Never write files into `_bmad/bmm` or `_bmad/core`**, because that changes every project using the plugin. Always resolve config values from this project's **`_bmad/config.yaml`**: `planning_artifacts` = `docs/laravel-migration`, `implementation_artifacts` = `docs/laravel-migration/stories`, so `sprint_status` = `docs/laravel-migration/stories/sprint-status.yaml`.

If what you find in the code disagrees with these files, the files are wrong or stale:
fix them in the same commit as the work, and say so in `handoff.md`.

| File | Kind | Who updates it |
|---|---|---|
| `handoff.md` | Living state | Every agent, at the end of every session |
| `00-migration-plan.md` | Plan | When a phase gate passes or a decision changes the plan |
| `01-feature-inventory.md` | Ledger | Every story that converts or verifies a feature (status columns) |
| `02-test-strategy.md` | Plan | When a test layer, tool or gate changes |
| `03-documentation-protocol.md` | Rules | Only by a logged decision |
| `brownfield/` | How the Next.js app actually behaves (Phase 0, read from source) | When a finding is resolved or more is learned from the code |
| `test-port-ledger.md` | Ledger | Every story that ports or replaces existing tests |
| `adr/ADR-NNN-*.md` | Architecture decisions | Created in solutioning and whenever a technical choice is made |
| `templates/story-conversion-record.md` | Template | Only by a logged decision |
