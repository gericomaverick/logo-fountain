# Resuming the Laravel migration (new session or new agent)

Read this first, every time. Five minutes and you have full context.

## 1. Orient (read, in order)
1. `handoff.md` → **Now**: phase, what's done, what's running, the exact next step, blockers, owner items. Then the **Session log** (newest first).
2. `stories/sprint-status.yaml`: the status of all 94 stories (`backlog` / `ready-for-dev` / `in-progress` / `review` / `done`).
3. The story file for whatever is `in-progress` or `review`, in `stories/<key>.md`. Its **Conversion record** says what's built, the evidence, the gotchas and the open items.
4. Only then go deeper, by area: `README.md` (doc map) → `01-feature-inventory.md` (what must exist; DV- rows = decided changes) → `brownfield/` (how the old app really behaves) → `architecture.md` + `adr/` (accepted decisions) → `ux-design.md` (the design contract) → `02-test-strategy.md`. Before writing portal code, read `apps/portal/AGENTS.md` and `project-context.md`.

## 2. Check the real state (don't trust the docs blindly)
```bash
git status -sb && git log --oneline -10          # uncommitted work? where is main vs origin?
git worktree list                                 # leftover agent worktrees (.claude/worktrees/*)
git branch --list 'story/*'                       # story branches not yet merged
docker ps --format '{{.Names}}' | grep -E 'lf-parity|lf0'   # running test stacks
cd tests/parity && npm run check && npm run coverage          # suite structure and coverage gate
```
- **A story `in-progress` with commits on a `story/*` branch or worktree** means an earlier agent was cut off. Read its story file, review the branch diff, and either finish it or merge what's verified. Don't start it again from scratch.
- **Background sub-agents don't survive a restart.** Anything they hadn't committed is lost, but their committed work is still in their worktree branch.
- If the docs and git disagree, **git wins**. Fix the docs in your first commit and note it in the session log.

## 3. Work (per story)
BMAD loop: `create-story` → implement → tests → review → merge. The rules that matter:
- **Before coding,** write the story file's *Behaviour notes* from the Next source and the brownfield doc.
- **Done means the DoD variant in `epics.md` → Overview:** E0, Laravel-only or Conversion.
- **Record as you go:**
  - the story record (evidence: commands plus pass/fail counts, and what wasn't run);
  - the inventory **Laravel/Tests** column;
  - `sprint-status.yaml`;
  - `DECISIONS.md` / `RISKS.md` / `ASSUMPTIONS.md` (the workspace root files, one line each, in the formats in the workspace `AGENTS.md`).
- **Commit after each passing step, and push main** (the owner's rule). Sub-agents can't push; the parent merges their branch into main and pushes.

## 4. Before you stop (even mid-task)
1. Commit everything that's verified. For half-done work, add a `WIP:` commit on the story branch (never on main), or describe exactly what's uncommitted.
2. Overwrite `handoff.md` → **Now**: date, phase, done, running, **next step (specific enough to start without asking)**, blockers, half-finished items with file paths.
3. Add one line to the **Session log**.
4. Push main.

## 5. Fixed facts (so you don't rediscover them)
- **Apps:** `apps/web` = Next.js (the frozen spec), `apps/portal` = Laravel (from story 1.1a), `apps/site` = the marketing site (out of scope), `tests/parity` = the shared suite.
- **Running the suite on Next:**
  - `cd tests/parity && npm run infra:up`
  - then `node scripts/next-stack.mjs "<gate>"` (e.g. `"@auth&@api"`, or no gate for everything).
  - Gotchas: run without the `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT` and `AI_AGENT` variables; Next must be on 127.0.0.1; in worktrees use `next dev --webpack`.
- **The DB lock:** `test.use({ db: "exclusive" | { shared } })`. Details are in `tests/parity/README.md`.
- **Owner preferences:** concise updates (overviews plus `file:line`); use sub-agents for parallel work; commit and push as you go.
- **Never write under `_bmad/bmm` or `_bmad/core`:** they're symlinks to the shared plugin. BMAD config comes from `_bmad/config.yaml`.
