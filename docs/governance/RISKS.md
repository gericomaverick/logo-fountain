# Logo Fountain — Risks Log

Format:
YYYY-MM-DD — <Risk>. Likelihood: <low|med|high>. Impact: <low|med|high>. Mitigation: <plan>. Owner: <role>. #risk

---

2026-03-01 — Package entitlements (concepts/revisions/deliverables) may be too generous and create margin/scope risk. Likelihood: med. Impact: high. Mitigation: calibrate entitlements using time-per-concept/revision estimates; enforce caps/add-ons; add admin override policy + audit. Owner: Product. #risk
2026-11-21 — The Mac's disk is nearly full (2.5 GB free): parallel builder stacks and the Next parity stack don't fit; a full disk already corrupted Docker's store once. Likelihood: high. Impact: med (blocks parallel work and 2.6's Next comparison). Mitigation: one builder stack at a time, `down -v` after gates; owner frees space (Xcode build output in ~/Code/table-trove*/ios/build). Owner: Mat. #risk
