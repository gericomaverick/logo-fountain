# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18
- **Phase:** Phase 1 (analysis) and Phase 2.2 (UX), drafts written. Awaiting owner review.
- **Done this session:** Phase 0 sweep finished (DB trigger and constraints → A-19, stale runbook notes). `product-brief.md` (BMAD 1.1, draft). `ux-design.md` (BMAD 2.2, full spec: IA, turn-based status model, verified colour tokens, type, components, patterns, journeys, responsive and a11y, per-screen priorities). `ux/design-directions.html` (A/B/C, light and dark). Finding F-15 / DV-12 (polling re-downloads R2 images). Technical research (BMAD 1.2) delegated to a sub-agent → `research-technical.md`.
- **Next step:** (1) merge and review the research output and update plan §3 rows (CONFIRMED / CHANGED / OPEN); (2) the owner answers: the brief's open questions, UX §15 (direction choice, turnaround copy, one-project shortcut, Files tab, Sfizia licence, brief uploads), the research owner questions; (3) then Phase 2.1 `create-prd` (functional requirements = inventory IDs, NFRs = X-series plus UX targets).
- **Blockers:** owner choices above (the UX direction gates E6/E7, not the PRD).
- **Half-finished:** `research-technical.md` (sub-agent running).

## Verify the baseline

Run these before starting. Record the results here when they change.

```bash
cd apps/web
npm run typecheck && npm run lint && npm run test      # last recorded (TODO.md): 95 files / 614 passed
npm run test:e2e                                        # last recorded: 5–6 Playwright tests passing
```

| Date | Next unit | Next E2E | Parity (Next) | Parity (Laravel) | Notes |
|---|---|---|---|---|---|
| 2026-11-18 | not re-run | not re-run | n/a (suite not built) | n/a | Figures above are from `docs/TODO.md`, not re-verified in this session |

## Session log (newest first, one line each)

- 2026-11-18: Product brief and UX spec drafted. Design directions page. F-15/DV-12. Research delegated.

- 2026-11-18: Findings ruled → DV- deviations. Redesign added to scope (UX phase, behavioural parity, page objects).

- 2026-11-18: Phase 0 deep scan of apps/web, `brownfield/` docs, test-port ledger, inventory v2, findings F-1…F-14.

- 2026-11-18: Owner resolved D1–D8. Plan bumped to v0.2.

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
