# Laravel migration: start here

This folder holds the BMAD plan for moving the portal app (`apps/web`, Next.js) to Laravel.
The marketing site (`apps/site`, Eleventy) is **out of scope** and stays as it is.

**Every agent, every session, reads these in this order before touching anything:**

1. `handoff.md`: where the work is right now, what's next and what's blocking it. **Always current.**
2. `00-migration-plan.md`: goal, constraints, BMAD phase sequence, epics, gates, open decisions.
3. `01-feature-inventory.md`: every feature that must exist in Laravel, with IDs and parity status.
4. `02-test-strategy.md`: how each converted piece is proven to work end to end.
5. `03-documentation-protocol.md`: what you must write down as you work, and where.
6. The BMAD story file for the story you are working on (in `docs/laravel-migration/stories/`).

**Location note:** `_bmad-output/` is git-ignored in this repo, so BMAD would normally write there and nothing would survive between agents. For this migration, every BMAD output (brief, PRD, architecture, epics, story files, `sprint-status.yaml`) is written to **`docs/laravel-migration/`**, with story files in `stories/`. When you run a BMAD workflow, override its output path to this folder.

If what you find in the code disagrees with these files, the files are wrong or stale:
fix them in the same commit as the work, and say so in `handoff.md`.

| File | Kind | Who updates it |
|---|---|---|
| `handoff.md` | Living state | Every agent, at the end of every session |
| `00-migration-plan.md` | Plan | When a phase gate passes or a decision changes the plan |
| `01-feature-inventory.md` | Ledger | Every story that converts or verifies a feature (status columns) |
| `02-test-strategy.md` | Plan | When a test layer, tool or gate changes |
| `03-documentation-protocol.md` | Rules | Only by a logged decision |
| `adr/ADR-NNN-*.md` | Architecture decisions | Created in solutioning and whenever a technical choice is made |
| `templates/story-conversion-record.md` | Template | Only by a logged decision |
