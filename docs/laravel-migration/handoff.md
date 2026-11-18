# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18
- **Phase:** Phase 0 complete. Phase 1 next.
- **Done this session:** Owner ruled on the findings → DV-1…DV-11 deviations in `01-feature-inventory.md`. Owner added a **full redesign** to scope (DV-UX): BMAD UX step 2.2 is now in, the parity suite is behavioural with per-app page objects, L7 baselines against the UX spec, and accessibility (L7a) and design-system lint (L7b) added.
- **Next step:** (1) read the remaining `apps/web/docs/*` runbooks (sweep item 4); (2) BMAD `create-product-brief` for the migration (success criteria: security, robustness, ecosystem, plus a coherent redesigned UI); (3) `technical-research`; (4) `create-ux-design` can start alongside the research. It needs the owner for the look and feel.
- **Blockers:** none.
- **Half-finished:** none.

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

- 2026-11-18: Findings ruled → DV- deviations. Redesign added to scope (UX phase, behavioural parity, page objects).

- 2026-11-18: Phase 0 deep scan of apps/web, `brownfield/` docs, test-port ledger, inventory v2, findings F-1…F-14.

- 2026-11-18: Owner resolved D1–D8. Plan bumped to v0.2.

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
