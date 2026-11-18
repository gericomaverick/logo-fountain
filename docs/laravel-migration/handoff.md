# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18
- **Phase:** Phase 0 (brownfield capture), scan complete. Gate open: waiting for owner calls on findings F-1…F-14.
- **Done this session:** `brownfield/` (index plus 8 docs, every API route, lib module and page read from source). Inventory corrected and extended (A-17, A-18, X-16…X-19 added; K-13 and N-13 resolved). `test-port-ledger.md` (110 files, all mapped). Test strategy E0 list extended (golden upload corpus, shared rule fixtures, snapshot schema, Origin architecture test, Next test seams).
- **Next step:** (1) the owner answers F-1…F-14 (`brownfield/index.md`), each logged as a decision; (2) read the remaining `apps/web/docs/*` runbooks for anything not visible in code (sweep checklist item 4); (3) Phase 1: BMAD `create-product-brief` (migration brief; success criteria = security, robustness, ecosystem per D1), then `technical-research` (versions, Hetzner provisioning, MinIO conditional writes, PHP Stripe/S3 specifics).
- **Blockers:** owner decisions F-1…F-14 (the defaults in the index apply if the owner says "parity first").
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

- 2026-11-18: Phase 0 deep scan of apps/web, `brownfield/` docs, test-port ledger, inventory v2, findings F-1…F-14.

- 2026-11-18: Owner resolved D1–D8. Plan bumped to v0.2.

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
