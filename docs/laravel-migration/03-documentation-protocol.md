# Documentation protocol: so no agent ever loses context

Sessions end, contexts compact, and agents get swapped. **The files are the memory.** If something isn't written in one of the places below, assume the next agent won't know it.

## 1. Where each kind of knowledge goes

| Knowledge | Where | Rule |
|---|---|---|
| Where we are right now | `laravel-migration/handoff.md` | Overwrite the "Now" section at the **end of every session**, including sessions that fail or get interrupted |
| What a feature must do, and whether it's done | `01-feature-inventory.md` | Update the status and Laravel columns in the same commit as the code |
| How one piece was converted | The BMAD story file `docs/laravel-migration/stories/<epic>-<story>-<slug>.md`, using the sections in `templates/story-conversion-record.md` | Written **while** working, not reconstructed afterwards |
| Story and epic progress | `docs/laravel-migration/stories/sprint-status.yaml` (BMAD) | Updated by the BMAD workflows |
| Why a technical choice was made | `laravel-migration/adr/ADR-NNN-<slug>.md`, plus a one-line entry in `DECISIONS.md` | One ADR per decision. Supersede, don't edit history |
| Product or scope decisions | `docs/governance/DECISIONS.md` (one line: `YYYY-MM-DD — decision. Rationale: … Impact: … #decision`; was `~/.openclaw/workspace/DECISIONS.md` until 2026-11-21) | Confirm in chat: "Logged to DECISIONS.md: …" |
| Risks and unverified assumptions | `docs/governance/RISKS.md` and `docs/governance/ASSUMPTIONS.md` (same one-line format, `#risk` / `#assumption`) | Log them as soon as they're found |
| Laravel coding conventions for agents | `apps/portal/AGENTS.md` (created in E1, refreshed with BMAD `generate-project-context`) | Update when a new pattern is established |
| How to run things | `apps/portal/docs/*.md` runbooks (the Laravel versions of `apps/web/docs/*`) | Written in the story that creates the capability |
| Gotchas found while converting | The story record's "Gotchas" section, **and** promoted to `apps/portal/AGENTS.md` if they apply beyond that story | |
| Daily journal | `handoff.md` → Session log (the openclaw journal is not available on the Mac, from 2026-11-21) | A short line per session linking the story and commit |

## 2. The session loop (every agent, every time)

**Start**
1. Read `README.md`, then `handoff.md`, then the current story file.
2. Run the "Verify the baseline" commands in `handoff.md`. If the results don't match what's recorded, stop and record the drift before doing anything else.

**During**
3. Before converting a feature, read its Next.js source files (listed in the inventory) and write the "Behaviour notes" section of the story record **first**. That's the explanation of what the old code really does, including edge cases. Converting comes second.
4. Record every deviation from Next.js behaviour in the story record and log a decision. Silent differences aren't allowed.
5. Commit in small steps. Each commit message names the story (e.g. `E4.3: …`).

**End** (do this even if stopped mid-task)
6. Fill in the story record's "Test evidence": the commands run, pass/fail counts, and what was **not** run.
7. Update the inventory statuses, `sprint-status.yaml` and `tests/parity/converted-tags.txt`.
8. Overwrite `handoff.md` → "Now": story, last commit SHA, what's done, the exact next step, blockers, anything half-finished (and which files).
9. Commit and push (standing rule from `DECISIONS.md` 2026-03-03).

## 3. Definition of done (story)

There are **three variants** (E0 spec / Laravel-only / Conversion), defined in `epics.md` → Overview. The checklist below is the **Conversion** variant. For E0, "green on Laravel" doesn't apply, and the inventory status stays `Not started` (fill in Tag and Tests). For Laravel-only stories, "green on Next" doesn't apply.

- [ ] Story parity tags green against **Laravel** and **Next**; all earlier tags green against Laravel
- [ ] L0–L2 green; L3 green if the story touches concurrency (X-09, A-10, K-05, X-13)
- [ ] Test-port ledger rows for this story resolved
- [ ] Inventory rows `Verified`, with the Laravel file references filled in
- [ ] Story record complete (every section, even if the answer is "none")
- [ ] Runbook or `AGENTS.md` updated if the story created a capability or a pattern
- [ ] Decisions, risks and assumptions logged
- [ ] `handoff.md` updated, then committed and pushed

## 4. Rules

- **No undocumented work.** If it isn't in a story, it doesn't get done. Unplanned work goes through BMAD `correct-course` or a new story.
- **The code wins over the docs.** If a document turns out to be wrong, fix it in the same commit and note it in `handoff.md`.
- **Never store secrets** (keys, tokens, passwords, live signed URLs) in any of these files. Store references only.
- **Record what you didn't verify.** "Not run: live Postmark" is required information, not an admission of failure.
