# Brief: Workbench lead, Epic 2 (data layer and domain core)

**From:** the owner (Mat), via Claude Code, 2026-11-21. **To:** the Workbench lead for Logo Fountain.
**This is a trial of Workbench on a real project.** Work the way the repo's own process says (BMAD, below) and keep the paper trail complete: the owner will judge the run by the branches and records it leaves.

## 1. The mission
Deliver **Epic 2** of the Next.js → Laravel migration: stories **2.1 → 2.7** in `docs/laravel-migration/epics.md` ("Epic 2: Data layer and domain core"). Each story finishes at **review**: done to its DoD variant, on its builder's `workbench/<builder name>` branch (builders are named after their story, §3), with its record written. The owner merges to main (that's gated).

Read first, in this order: `CLAUDE.md`, `docs/laravel-migration/RESUME.md` (the restart checklist and fixed facts), `handoff.md` → **Now**, `stories/sprint-status.yaml`, then `apps/portal/AGENTS.md` and `project-context.md` before any portal code.

## 2. Where things stand (verified 2026-11-21)
- **Epics 0 and 1 are done.** `apps/portal` is a working Laravel 13 / Inertia / React app with its security middleware, design system, components and shells. `apps/web` (Next.js) is the frozen spec. `tests/parity` is the shared behaviour suite.
- **2.1 Schema migrations and roles is `ready-for-dev`:** `stories/2-1-schema-migrations-and-roles.md` has the full schema checklist (22 tables, 29 FKs, checks, trigger), the tasks, the test plan and the **owner's decisions** (its "Decisions" section). Start here.
- **2.2–2.7 are `backlog`.** Each needs `create-story` first.
- **Baseline on this Mac (2026-11-21, main `53077a6`):** `bin/test` Pest 318 passed; `bin/ui-test` 217/217; `bin/browser-test` 260 passed + 8 phone-only skips. A builder stack (`lf-wb1`, from the setup script) also passed `bin/test` 318/318 and answered `/up` 200.

## 3. Order and parallelism
```
2.1 ──┬── 2.2 models, policies, client concept scope ──┐
      ├── 2.3 state machine + display status           ├── 2.6 Laravel seed scenarios (after 2.2)
      ├── 2.4 transactions, locks, versioning, audit ──┼── 2.7 lifecycle mail pipeline (after 2.4)
      └── 2.5 shared rate-limit store                  ┘
```
- **2.1 alone first.** Everything depends on its migrations.
- **Merging to main is gated, and the owner may be away.** So don't wait for a merge: when 2.1 reaches review, branch 2.2–2.5 **from the 2.1 builder's branch** (fork the 2.1 builder; on this run it's `workbench/schema`), and 2.6/2.7 from their parents' branches. Say in each record which branch it stacks on, so the owner can merge in order (the branch names come from the builder names, below). If review changes 2.1, rebase the children.
- **Branches: one per builder, the one Workbench gives it.** Workbench names a builder's branch `workbench/<agent name>` and tracks, reviews and forks from that branch only. So **name each builder after its story** (e.g. `2-1-schema`, `2-2-models`, `2-3-state`, `2-4-tx`, `2-5-limits`, `2-6-seed`, `2-7-mail`), and builders **never create or switch branches**. Stack a dependent story by **forking the parent builder** (the fork branches from the parent's branch). If a builder did make its own branch, it runs `git checkout -B workbench/<its agent name>` in its copy and notes the old name in its record.
- **Settled, not an owner question:** a `Db::serializable()` retry that runs out maps to the **existing 409 codes** (accepted ADR-011, line 8). Record that in 2.4.
- **Run `create-story` for 2.2–2.5 while 2.1 is being built** (a researcher can draft them; no code, no Docker needed). That's the cheapest parallelism.
- **One builder with a running portal stack at a time** until the owner frees disk (see §5). Other builders can write code and story files meanwhile, and take the stack in turn.

## 4. The BMAD loop, per story (what "following the process" means here)
The BMAD workflow files aren't installed on this Mac (`_bmad/bmm` dangles). Follow the repo's own form instead: the existing story files (e.g. `stories/1-3-…md`, `2-1-…md`) and `templates/story-conversion-record.md`.
1. **create-story:** write `stories/<key>.md`: the acceptance criteria expanded into testable items, **Behaviour notes from the Next source and the brownfield doc with `file:line`**, tasks, a test plan, the DoD variant from `epics.md` → Overview, dependencies and follow-ups, open questions with a recommendation each. Set `ready-for-dev`.
2. **Implement** in the builder's copy. Write tests with the code. Commit after each passing step.
3. **Gates** (in `apps/portal`, the builder's own stack): `bin/test` (Pint, Larastan level 9, Pest), plus `bin/ui-test` / `bin/browser-test` if UI changes. `@pg-race` tests live in `tests/Concurrency`. Record **commands and pass/fail counts**, and what wasn't run and why.
4. **Review:** a **critic** reviews the branch diff against the story's ACs and `apps/portal/AGENTS.md` (correctness, missing tests, rule breaks), without being given the builder's conclusions. The builder fixes; the critic re-checks.
5. **Record:** the story's **Conversion record**; the inventory **Laravel/Tests** columns (`01-feature-inventory.md`); `sprint-status.yaml` → `review`; one line each in `docs/governance/DECISIONS.md`, `RISKS.md`, `ASSUMPTIONS.md` where something was decided, risked or assumed; `test-port-ledger.md` rows the story resolves.
6. **Hand back** (lead → owner): the branch, its base, a five-line summary, the evidence, open items.

## 5. This machine (it's new; read this)
- **Docker is OrbStack.** `docker` isn't on the default PATH: start shell commands with `export PATH="$HOME/.orbstack/bin:$PATH"`.
- **Each builder's copy has its own portal stack**, set up for you (`logo-fountain.setup.sh`): its own compose project `lf-wbN` and ports, written into `apps/portal/.env`. In `apps/portal`, `docker compose up -d`, `bin/test` and `bin/artisan` use it automatically. Before `bin/browser-test`/`bin/lighthouse`, run the export line in that `.env`. **Never touch `lf-portal`** (the owner's stack, port 8080) or another builder's.
- **The disk is nearly full** (2.5 GB free on 2026-11-21; a builder stack costs about 0.5 GB, its `npm ci` included). `docker compose down -v` your stack as soon as your gates have passed; **one running builder stack at a time** (two only if `df -h /System/Volumes/Data` shows more than 10 GB free). The owner's `lf-portal` stack stays up. If Docker reports "no space left on device", stop and ask the owner; don't prune images or volumes you didn't create.
- **Pushing:** `origin` is HTTPS and signed in (gericomaverick, repo-local). The guard lets you push your own `workbench/*` branch; main is the owner's.
- **The guard** refuses any command containing the word `forge` (it means the hosting service). The docs mention Laravel Forge, so search with `grep -i 'f[o]rge'` if you have to.
- **The parity suite on Next can't run here yet:** `apps/web` and `tests/parity` have no `node_modules`, and installing them plus the Next stack won't fit on the disk. This matters only for 2.6 (below).

## 6. Rules that bite (from the repo; break none)
- **Prefer Laravel conventions** over reproducing Next/Prisma artefacts wherever the parity suite can't see the difference (owner, 2026-11-21: "leave behind as much Next.js as possible"). Keep the observable behaviour. If a story file recommends "as Next" for something no test observes, choose the Laravel way and log it.
- **Migrations run as the schema owner:** `--database=pgsql_migrate`, in tests too. The default `pgsql` connection is the runtime role and can't do DDL (2.1 sets up the test harness for this).
- `apps/web` is frozen. Accepted ADRs aren't edited: supersede them with a new ADR. Never write under `_bmad/bmm` or `_bmad/core`.
- `apps/portal/AGENTS.md` is checked for drift by `bin/check-agents-guide` (run by `bin/test`). If you add a rule or command, update the guide.
- Concise records: overviews plus `file:line`.

## 7. Story notes the epic doesn't say
- **2.1:** the "Decisions" section is final (e.g. `users.email_verified_at`, `timestamps(3)`, no `ON UPDATE CASCADE`). Existing dev volumes only run the Postgres init scripts once: `docker compose down -v` before testing the role changes.
- **2.3** needs the shared fixture from story 0.6b (`tests/parity/fixtures/…`). The PHP `ProjectState` must agree with every case.
- **2.6:** the Laravel half (`php artisan parity:seed` for every scenario in `tests/parity/fixtures/scenarios/`, the shared SQL assertion script, and `adapters/seed.ts` calling the seeder **inside the portal container**, not host `php`) can all be built and tested against Laravel. Comparing against the Next seed needs the Next stack (§5). Build it so the comparison is one command, run the Laravel side, and leave the Next comparison as an **owner item** with that exact command. Map the 2.1 decisions in the assertion (e.g. Next `emailVerified=true` ⇔ `email_verified_at IS NOT NULL`).
- **2.7:** the branded base layout belongs to 4.4. Make a minimal base here, as the epic says.
- **Not in scope:** the Inertia ^3.7 bump due from 2026-11-23 (owner follow-up). Epic 3 and later.

## 8. When to stop and ask the owner (on the board)
- Merging to main or pushing to main (gated).
- A story's open question with no safe recommendation, or a conflict between docs that changes behaviour (note the docs-vs-code disagreements you find either way).
- Disk full, Docker broken, or a gate that fails for a reason outside the story.
- Anything that would change `apps/web`, an accepted ADR, or delete something outside your copy.

## 9. Done for this brief
All seven stories at `review` on stacked `workbench/*` branches with complete records, or as far as possible with each blocker written up. Then update `handoff.md` on the last branch: **Now** (phase, done, the exact next step, blockers, owner items: merge order, the 2.6 Next comparison, anything else) and one **Session log** line naming Workbench.
