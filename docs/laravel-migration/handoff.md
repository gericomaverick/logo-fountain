# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18
- **Phase:** 3.3 readiness check running (sub-agent → `readiness-report.md`).
- **Done this session:** PRD validated (PASS WITH FIXES); all 13 recommended edits applied (FR58, NFR-M4, NFR-O1, measurable NFRs, exact byte limits, two email modes and more). Inventory rows A-09, C-07 and D-18 corrected. `epics.md`: 10 epics, 74 stories, every inventory row and FR1–FR58 covered (checked by script).
- **Next step:** apply the readiness findings, then BMAD 4 sprint planning (`stories/sprint-status.yaml`), then `create-story` for **0.1**. E0 runs against the *current Next.js app*.
- **Blockers:** owner review of the architecture and epics (non-blocking for E0, which is Next-only test work). Open owner inputs: turnaround copy, one-project shortcut and Files tab approval, the Sfizia app licence, brief uploads, launch date.
- **Half-finished:** readiness check (sub-agent).
- **Remote worker:** MacBook (`ssh macbook`). Claude needs `setup-token` there (paused by the owner).

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

- 2026-11-18: PRD validation fixes. Epics and stories (74). Readiness check delegated.

- 2026-11-18: Hosting/backup/Cloudflare decisions. Architecture plus 28 ADRs. DV-13.

- 2026-11-18: Product brief and UX spec drafted. Design directions page. F-15/DV-12. Research delegated.

- 2026-11-18: Findings ruled → DV- deviations. Redesign added to scope (UX phase, behavioural parity, page objects).

- 2026-11-18: Phase 0 deep scan of apps/web, `brownfield/` docs, test-port ledger, inventory v2, findings F-1…F-14.

- 2026-11-18: Owner resolved D1–D8. Plan bumped to v0.2.

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
