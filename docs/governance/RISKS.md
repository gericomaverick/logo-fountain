# Logo Fountain — Risks Log

Format:
YYYY-MM-DD — <Risk>. Likelihood: <low|med|high>. Impact: <low|med|high>. Mitigation: <plan>. Owner: <role>. #risk

---

2026-03-01 — Package entitlements (concepts/revisions/deliverables) may be too generous and create margin/scope risk. Likelihood: med. Impact: high. Mitigation: calibrate entitlements using time-per-concept/revision estimates; enforce caps/add-ons; add admin override policy + audit. Owner: Product. #risk
2026-11-21 — The Mac's disk is nearly full (2.5 GB free): parallel builder stacks and the Next parity stack don't fit; a full disk already corrupted Docker's store once. Likelihood: high. Impact: med (blocks parallel work and 2.6's Next comparison). Mitigation: one builder stack at a time, `down -v` after gates; owner frees space (Xcode build output in ~/Code/table-trove*/ios/build). Owner: Mat. #risk
2026-11-21 — Disk risk eased: 21 GB free after clearing ~/Code/table-trove*/ios/build (dSYMs and archives kept). Two builder stacks allowed; parity on Next should fit. #risk
2026-11-21 — Production DB grants depend on a deploy step that doesn't exist yet: if a deploy runs `migrate` without `php artisan db:grants`, new tables get the default privileges only if the migrate role is the one that created them, and a new operator-only table would be runtime-readable until revoked in `ops/postgres/runtime-grants.sql`. Likelihood: med. Impact: high. Mitigation: story 2.1 wires `db:grants` into dev init and the test harness; the deploy story (Epic 9) must run migrate + `db:grants` together, and any operator-only table is revoked in the same commit. #risk
2026-11-22 — The truncation test harness (`tests/Support/TruncatesDatabaseAsOwner.php`) never disconnects, so each `tests/Concurrency` test holds ~2 PG connections until GC; `--group=pg-race` hit "remaining connection slots are reserved" (100 max) during story 2.4. Likelihood: high as Concurrency tests grow. Impact: med (flaky L3 suite). Mitigation: 2.4's files disconnect in `afterEach`; the lasting fix is a disconnect in the harness trait (outside 2.4's scope). Owner: lead. #risk
2026-11-22 — Story 2.2/2.4: `projects.version` is not mass-assignable but a direct attribute save can still change it until 2.4's version guard lands (whichever merges second adds it). #risk
2026-11-22 — Story 2.7: marker exists at dispatch, so a mail whose 4 retries are exhausted (in `failed_jobs`) is not resent for that event; operators must watch `failed_jobs`. #risk
