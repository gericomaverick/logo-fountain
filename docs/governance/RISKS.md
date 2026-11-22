# Logo Fountain — Risks Log

Format:
YYYY-MM-DD — <Risk>. Likelihood: <low|med|high>. Impact: <low|med|high>. Mitigation: <plan>. Owner: <role>. #risk

---

2026-03-01 — Package entitlements (concepts/revisions/deliverables) may be too generous and create margin/scope risk. Likelihood: med. Impact: high. Mitigation: calibrate entitlements using time-per-concept/revision estimates; enforce caps/add-ons; add admin override policy + audit. Owner: Product. #risk
2026-11-21 — The Mac's disk is nearly full (2.5 GB free): parallel builder stacks and the Next parity stack don't fit; a full disk already corrupted Docker's store once. Likelihood: high. Impact: med (blocks parallel work and 2.6's Next comparison). Mitigation: one builder stack at a time, `down -v` after gates; owner frees space (Xcode build output in ~/Code/table-trove*/ios/build). Owner: Mat. #risk
2026-11-21 — Production DB grants depend on a deploy step that doesn't exist yet: if a deploy runs `migrate` without `php artisan db:grants`, new tables get the default privileges only if the migrate role is the one that created them, and a new operator-only table would be runtime-readable until revoked in `ops/postgres/runtime-grants.sql`. Likelihood: med. Impact: high. Mitigation: story 2.1 wires `db:grants` into dev init and the test harness; the deploy story (Epic 9) must run migrate + `db:grants` together, and any operator-only table is revoked in the same commit. #risk
2026-11-22 — The timeline/customer-action rules now exist twice in the portal (PHP `App\Domain\ProjectTimeline`/`ProjectState`, pinned by `tests/parity/fixtures/rules/state-machine.json`; TS `resources/js/lib/status.ts`, pinned by `tests/js/fixtures/next-timeline.json`), and neither test reads the other's fixture, so a change to one side alone would not be caught. Likelihood: low (both derive from frozen `apps/web`). Impact: med (server and UI disagree on turn/stage). Mitigation: change both together; a later story can point `status-logic.test.ts` at the shared fixture. Owner: dev. #risk
