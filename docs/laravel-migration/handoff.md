# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18
- **Phase:** 3.1 architecture drafted. PRD validation running (sub-agent → `prd-validation-report.md`).
- **Done this session:** hosting, backups, Cloudflare and alerts decided (DECISIONS.md 2026-11-18); DV-13 (95 MB ZIP cap); `architecture.md` plus `adr/` (28 ADRs, status Proposed); PRD coverage fixed (all 116 rows cited).
- **Next step:** (1) apply the PRD validation fixes; (2) the owner reviews `architecture.md`, and on approval the ADRs move to Accepted; (3) BMAD 3.2 `create-epics-and-stories` from the plan §5a skeleton plus the PRD FRs (each story lists its inventory IDs and parity tags); (4) 3.3 readiness check; (5) Phase 4 sprint planning, starting with **E0, the parity harness on Next.js**.
- **Blockers:** none hard. Still-open owner inputs (non-blocking for epics): turnaround copy, the one-project shortcut and Files tab approval, the Sfizia app licence, brief uploads, launch date.
- **Half-finished:** PRD validation (sub-agent).
- **Remote worker:** MacBook (`ssh macbook`) set up, but Claude needs `setup-token` there (paused by the owner).

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

- 2026-11-18: Hosting/backup/Cloudflare decisions. Architecture plus 28 ADRs. DV-13.

- 2026-11-18: Product brief and UX spec drafted. Design directions page. F-15/DV-12. Research delegated.

- 2026-11-18: Findings ruled → DV- deviations. Redesign added to scope (UX phase, behavioural parity, page objects).

- 2026-11-18: Phase 0 deep scan of apps/web, `brownfield/` docs, test-port ledger, inventory v2, findings F-1…F-14.

- 2026-11-18: Owner resolved D1–D8. Plan bumped to v0.2.

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
