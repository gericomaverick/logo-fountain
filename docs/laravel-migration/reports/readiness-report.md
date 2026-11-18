---
stepsCompleted: [step-01-document-discovery, step-02-prd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
workflow: bmad-bmm-check-implementation-readiness (BMAD step 3.3, run autonomously, no menus)
date: 2026-11-18
assessor: Claude (sub-agent), for Mat (owner)
outputPathOverride: docs/laravel-migration/readiness-report.md (README location note; the default `{planning_artifacts}` is the git-ignored `_bmad-output/`)
documentsAssessed:
  - README.md, handoff.md, 00-migration-plan.md, 01-feature-inventory.md, 02-test-strategy.md, 03-documentation-protocol.md
  - product-brief.md, research-technical.md, prd.md, reports/prd-validation-report.md, ux-design.md
  - architecture.md, adr/ADR-001…028 + adr/README.md, epics.md, test-port-ledger.md, brownfield/*.md, templates/story-conversion-record.md
  - spot checks (read-only) of apps/web: src/lib/storage/r2.ts, src/lib/auth/mail.ts, src/lib/project-lifecycle-email.ts, src/lib/checkout-fulfillment.ts, src/app/api/stripe/webhook/route.ts, src/lib/stripe-price-allowlist.ts, src/lib/local-dev-fixture-guard.ts, src/lib/entitlements.ts, src/components/revision-purchase.tsx
  - _bmad/config.yaml, _bmad/bmm/workflows/4-implementation/*/workflow.yaml
verdict: READY WITH CONDITIONS
---

# Implementation readiness assessment: Logo Fountain portal on Laravel

**Date:** 2026-11-18 · **Project:** Logo Fountain (Next.js → Laravel migration)

## 1. Verdict

**READY WITH CONDITIONS.**

The plan is unusually complete. Every one of the 116 inventory rows appears in at least one story's **Covers** (checked by script). Every FR (1–58) and every NFR (22) has a story home. The ADRs are coherent, and the PRD validation fixes are applied (with five small omissions, listed in §3). The parity-first strategy (E0 before any Laravel code) is sound.

The conditions are below. None of them needs re-planning. Most are one-paragraph edits to `epics.md` and `02-test-strategy.md`, plus three owner inputs.

- **E0 can start now with 0.1, 0.2 and 0.6.** These stories need no seams and no secrets.
- **Before 0.3, 0.4 and 0.5:**
  - fix C1 (the Stripe path isn't offline, and the price IDs are hard-coded);
  - fix M1 (the seam scope and the freeze-exception record);
  - fix M2 (the seed guard can't be reused);
  - fix M3 (BMAD writes to the git-ignored folder);
  - fix M4 (a DoD that E0 and Laravel-only stories can't satisfy).
- **Before E1:**
  - the owner reviews the architecture (all 28 ADRs are still `Proposed`);
  - the Sfizia app licence (needed by 1.7);
  - fix M5 (the rate-limiter contract), M6 (the shared lifecycle-mail pipeline has no early story) and M7 (story tags can't go green before their prerequisites exist).
- **Before E6/E7:** the plan's gate "owner approves the look of key screens", the one-project shortcut decision, and the turnaround copy.

Counts: **1 critical, 13 major, 27 minor** findings (§12), and **26 stale statements** (§13).

## 2. Document discovery (step 1)

| Type | File(s) | Notes |
|---|---|---|
| PRD | `prd.md` (+ `reports/prd-validation-report.md`) | Whole document, no sharded duplicate |
| Architecture | `architecture.md` + `adr/` (28 ADRs plus an index) | The ADR files are one-line decisions that point back to `architecture.md` §3, so there's no conflict |
| Epics and stories | `epics.md` | 10 epics, 74 stories (recounted: 9+9+6+4+9+8+11+11+2+5). The `stories/` folder doesn't exist yet |
| UX | `ux-design.md` + `ux/design-directions.html` | Whole document |
| Supporting | plan, inventory, test strategy, doc protocol, brief, research, ledger, brownfield (9), handoff | — |

No duplicates were found, and no required document is missing. **Warning:** the workflow's config path `_bmad/bmm/config.yaml` doesn't exist. The live config is `_bmad/config.yaml`, which points `planning_artifacts` and `implementation_artifacts` at the git-ignored `_bmad-output/` (finding M3).

## 3. PRD analysis (step 2)

- **FRs:** FR1–FR58 (58). §6.6 lists FR58 after FR54, which is fine, but every count elsewhere still says 57 (stale list, §13).
- **NFRs:** S1–S6, R1–R5, P1–P2, A1–A4, M1–M4 and O1 (22).
- **Additional constraints:**
  - DV-1, DV-2, DV-4…DV-9 and DV-11…DV-13; DV-3 is deferred and DV-10 doesn't exist;
  - DV-UX;
  - the `apps/web` freeze;
  - no data migration;
  - single admin;
  - noindex;
  - SAQ A.

**PRD validation fixes: verified.** All 7 majors are applied: M1 (NFR-R5), M2 (NFR-M4), M3 (FR12/FR17), M4 (FR53), M5 (FR46), M6 (FR58) and M7 (the measurement methods and Larastan 9). Minors m1–m18, m20 and m23 are applied. Not applied, or only partly:

| Validation item | State | Where |
|---|---|---|
| M5: "can see which thread a customer's message or comment is in" | Omitted from FR46 | `prd.md:93` |
| M6: "without moving content under the reader or losing typed input" | Omitted from FR58 (it does live in UX §12) | `prd.md:106` |
| m19: NFR-R3 as an outcome; FR54 actor | Not applied (optional) | `prd.md:126`, `:105` |
| m21: FR14 "longer than expected" has no threshold (45 s) | Not applied | `prd.md:57` |
| m22: FR45 "email marker" → "lifecycle email marker (X-18)" | Not applied | `prd.md:93` |
| m2: brief DV list | Fixed at `product-brief.md:102`, still stale at `:43` ("DV-1…DV-11") | `product-brief.md:43` |
| m3/m17: inventory A-09, C-07, D-18 | Fixed | `01-feature-inventory.md:25,66,102` |

The PRD is complete and testable. Its front matter (`status: … validate with bmad-bmm-validate-prd next`) and §9's last sentence are stale.

## 4. Coverage validation (step 3)

### 4.1 FR → story → test layer and tag

| FR | Story | Layer / tag | Note |
|---|---|---|---|
| 1 | 4.3 | L4/L5 `@auth` | |
| 2 | 4.4, 4.5 | L5 `@auth @security` | |
| 3 | 4.4, 4.6 | L5 `@auth` (mail adapter) | |
| 4 | 4.6 | L4/L5 `@auth` | |
| 5, 6 | 4.7 | `@auth @settings` | |
| 7 | 4.1 | `@auth` | |
| 8, 11 | 4.8 | `@auth @authz` | |
| 9 | 2.1, 4.9 | Pest `@cli` | |
| 10 | 4.2 | L3 `@pg-race` | |
| 12, 13 | 5.1 | `@checkout @deviation` | |
| 14 | 5.4 | `@checkout` | |
| 15 | 5.2, 5.3 | L3 + `@webhook` | |
| 16 | 5.3 | `@webhook @checkout @email` | |
| 17, 18 | 5.5 | `@upsell @deviation` | |
| 19 | 5.6 | `@upsell` | **Forward dependency on 6.2** (M8) |
| 20 | 5.8, 6.11 | `@invoices` | |
| 21 | 5.7 | `@admin @webhook @deviation` | |
| 22 | 6.7 (K-14) | `@revisions` + L3 | The coverage map says E5, but K-14 is built in 6.7 |
| 23 | 6.1, 4.8 | `@client` | The admin → admin-workspace redirect isn't in any AC (m) |
| 24 | 6.2 | `@client @contract` | |
| 25 | 6.4, 6.5 | `@brief` | |
| 26 | 6.6 | `@concepts @deviation` | |
| 27, 28 | 6.7 (+6.3) | `@concepts @revisions` | |
| 29 | 6.8 | `@approval` | |
| 30 | 6.10 | `@finals` | Invoices in the Files tab: no AC, and no 5.8 dependency (m) |
| 31, 32 | 6.9 | `@messages` | |
| 33 | 6.11, 1.7 | `@settings @visual` | Admin theme isn't stated in any story (m) |
| 34 | 2.2, 0.7 | L6 `@authz` | |
| 35 | 7.1 | `@admin` | Search, filter and land-on-section aren't in the AC (m) |
| 36 | 7.2 | `@admin` | |
| 37 | 7.3 | `@admin @state` | |
| 38 | 7.4 | `@admin @brief` | **No AC** |
| 39 | 7.5 | `@admin @concepts @uploads` | Oversized (§14) |
| 40 | 7.6 | `@admin @concepts` | **No AC** |
| 41 | 7.5, 7.7 | `@admin @revisions` | 7.7 has **no AC** |
| 42 | 7.8 | `@admin @finals @deviation` | |
| 43, 44 | 7.9 | `@admin @entitlements` | |
| 45, 46 | 7.10 | `@admin @audit @messages` | **No AC**. The admin concept-thread reply (FR46) isn't explicit |
| 47 | 7.11 | `@admin @ops` | The public `/api/health` isn't in the AC (m) |
| 48 | 4.8, 2.2, 0.7 | `@authz` | |
| 49, 50 | 8.1, 8.2 (built in 4.4, 5.3, 6.x, 7.x) | `@email` | The pipeline has no early home (M6) |
| 51, 52 | 3.1 (+6.6, 6.10) | `@storage` | |
| 53 | 3.2, 3.3 | Pest + golden corpus, `@uploads` | |
| 54 | 3.4 | component test + L5 | |
| 55 | 0.4, 1.1, 2.6 | — | |
| 56 | 2.1, 9.1, 9.2 | drill | |
| 57 | 1.3, 1.5, 9.1 | `@security`, L9 | Production-mode behaviour can't be covered by parity in dev mode (m) |
| 58 | 5.4, 6.2, 7.2, 7.10, "hook in 1.8" | `@client @admin` | 1.8 has no `usePolling` AC, and "Reconnecting…" isn't tested anywhere (M9) |

**FR coverage: 58/58 (100%) have a story.** 6 FRs depend on stories without ACs (7.4, 7.6, 7.7, 7.10).

### 4.2 NFR → story → measurement

| NFR | Story | Measurement named? |
|---|---|---|
| S1 | 1.4 | yes (arch test plus L4/L6) |
| S2 | 1.6, 9.1 | yes |
| S3 | 1.6, 2.4 | partly: the log-processor test and the "CI grep of test-run logs" have no story (m) |
| S4 | 2.5 | **conflict** (M5) |
| S5 | 0.7, 9.4 | yes |
| S6 | 1.1, 9.4 | yes |
| R1 | 5.2 | yes |
| R2 | 6.7, 7.5/7.6 | yes (L3) |
| R3 | 2.4 | yes |
| R4 | 9.2 | yes |
| R5 | 4.4, 8.1 | yes |
| P1 | 9.4 | yes (k6) |
| P2 | 9.4 | partly: "Lighthouse **in CI**" has no story or CI job (ADR-028 doesn't list it) (m) |
| A1 | 1.8, E6/E7, 9.4 | yes |
| A2 | 1.9, E6/E7 | yes |
| A3 | 9.4 | yes |
| A4 | 1.7 | yes |
| M1 | 1.1 | 1.1 says "agreed level" where it should say **level 9** (m) |
| M2 | 1.2, 9.3, DoD | yes |
| M3 | 1.6, 2.1 | yes |
| M4 | 0.7 | yes |
| O1 | 9.3 | yes |

### 4.3 Inventory and DV coverage

- All 116 rows are in story **Covers**, with ranges expanded. The script was re-run for this report.
- Every DV row has a story: DV-1 and DV-4/5 → 5.1, DV-2 → 5.5, DV-6 → 5.7, DV-7 → 2.2 and 6.6, DV-8 → 8.1, DV-9 → 7.5, DV-11 → 7.8, DV-12 → 3.4, DV-13 → 3.3 and 7.8.
- **Gap:** no E0 story requires an `@deviation` test for **every** DV row. 0.7 names only DV-7 (m, folded into the split of 0.7/0.8).

## 5. UX alignment (step 4)

The UX document exists and agrees with the PRD (J1–J7 → FRs, as checked in the PRD validation) and the architecture (ADR-021, 022 and 023, no SSR, an inline theme script). Issues:

1. **UX-driven behaviour changes aren't classified for parity (M10).** These change *what happens*, not just the look:
   - the one-project shortcut (post-login landing);
   - admins on customer URLs going to *that project's* workspace (today it's `/dashboard` → `/admin`);
   - the Files grouping;
   - the upsell dismissal ("snooze") rule.

   A behavioural parity test of the post-login landing will diverge between the apps. The page objects can absorb some of this, but nothing says so, and they aren't tagged `@deviation` (DV-UX).
2. Radix coverage: UX §11 marks Select★ and Sheet★ as needing primitives, but ADR-022 lists only dialog, menu, tabs, popover and tooltip (m).
3. **Files tab status is inconsistent.** DECISIONS 2026-11-18 (line 43) records the Files tab as decided. `ux-design.md:343` and `prd.md:149` still list it as pending (stale).
4. Some UX elements have no story:
   - the J7 "Payment card → Reprocess" UI (5.7 is API-only, and 7.2 shows the order but has no reprocess action);
   - admin keyboard shortcuts (`g q`, `?`);
   - breadcrumbs (implicitly 1.9).

   (m)
5. Upload-dropzone copy says "up to 10 MB", while the limit is 10 MiB (10,485,760 bytes). Harmless, but it should be stated deliberately (m).
6. The upsell "Not now" behaviour: C-04 says "per session" and 6.3 says "24 h". The code (`revision-purchase.tsx:146`) does both: a 24 h expiry held in `sessionStorage`. The AC should say exactly that (m).

## 6. Epic quality review (step 5)

### 6.1 Epic structure
- E0, E1, E2, E3, E8 and E9 are **technical epics** by BMAD's standard. For a parity-gated brownfield rewrite, this is justified: the parity harness and the security core *are* the product guarantees, and E4–E7 deliver user value. This is accepted as an explicit, documented deviation from BMAD practice. Record it in `epics.md` §Overview (m).
- 2.1 creates **all tables up front**, against BMAD's "tables when first needed". This is justified (a fixed brownfield schema, the `is_admin` trigger and grants, and FK behaviours ported as one unit). Accept and note it (m).

### 6.2 Dependency analysis (After graph)
The graph is **acyclic** (checked). It isn't fully **buildable in epic order**:

| Story | Problem | Fix |
|---|---|---|
| **5.6** | After 6.2 (E6), a forward cross-epic dependency | Move 5.6 into E6 after 6.3 (as "6.3b Post-purchase confirmation"), or mark E5 done without it |
| **6.1** | Shows the project list (turn pills, new-dots), but `GET /api/projects` (C-02) is built in 6.2 | Put 6.1 after 6.2, or move C-02's list endpoint into 6.1 |
| **2.6** | `concepts-ready`, `final-files-ready` and `delivered` need stored objects (3.1). After lists only 2.2. The AC verifies via "read endpoints once they exist" | After 2.2, 2.3, 3.1. AC: compare against a shared scenario manifest (`tests/parity/fixtures/scenarios/*.json`: row counts, statuses, entitlements, object keys) at DB level; re-verify over HTTP in 6.2 |
| **0.4** | Seeding concepts and finals on Next writes objects through the R2 seam (0.3). After lists only 0.2 | After 0.2, 0.3 |
| **4.3** | Login runs inside the credential fence (ADR-007: "every auth read and write"), but After lists 4.1 and 2.5 only | Add 4.2 |
| **4.9** | Builds the sign-in and magic-confirm screens, but 4.3 and 4.5 aren't in its chain | Add 4.3, 4.5 (or split, §14) |
| **7.1** | Needs the admin guard (4.8) | Add 4.8 |
| **3.2, 3.3** | PHP code, but only After 0.6 (no Laravel skeleton) | Add 1.1 |
| **6.5, 7.5, 7.6** | Post system messages before the X-16 dedup rule exists (6.9) | Move X-16 into 6.5 or 2.4 (`SystemMessages::post`) |
| **5.3** onwards | Use queued lifecycle mail and `email_sent:*` markers (X-18, DV-8), which are "finalised" in 8.1 with "After: built incrementally" | New story before 5.3 (M6) |
| **8.1** | "After: built incrementally in E5–E7" isn't a dependency | After 5.3, 6.5–6.10, 7.5–7.9 |
| **6.10** | FR30 puts invoices in Files | Add 5.8 |

### 6.3 Story sizing and acceptance criteria
- **Oversized** (§14 has the splits): 0.6, 0.7, 0.8 (the largest: 23 journeys, 7 UX journeys, abuse cases, every Next page object and every deviation test), 1.8, 4.9, 7.5, 7.8, 9.4. 1.1 and 6.2 are borderline.
- **No ACs at all:** 1.2, 7.4, 7.6, 7.7, 7.10 (M11).
- **ACs mostly happy-path.** That's acceptable, because `epics.md` delegates the full brownfield behaviour to the story file. But `create-story` must be told to pull every error code from the cited brownfield section. Add this to the create-story instructions or the DoD (m).
- **ACs not verifiable when the story ends:** 2.6 ("once they exist"), 8.1 ("finalises"), 9.1 ("E4–E7 feature-complete").

## 7. ADRs reflected in stories (requested check 2)

| ADR | Reflected in | Contradiction or gap |
|---|---|---|
| 008 CSRF exclusion + origin guard | 1.4 (the AC names the `PreventRequestForgery` exclusion and the arch test) | None. 1.4 should name the X-01 exemptions (webhook, checkout email flows, `/checkout/start`, health) in the AC (m) |
| 009 rate limits on `pgsql_limits` | 2.5 | **2.5 AC: "inside an open transaction the limiter refuses". NFR-S4: "keeps counting when the surrounding business transaction rolls back". Research §5.4/risk 5: `transactionLevel()===0` assertion plus "wrong password inside the fence still counts". ADR-009: dedicated connection.** These describe two different contracts. Also, 2.5 doesn't name `pgsql_limits`, and NFR-S4's parallel-process and rollback tests aren't in its AC (M5) |
| 011 `Db::serializable` | 2.4 (AC), used by 6.7, 6.8, 6.10, 7.3, 7.5 | None. The "no nesting" rule isn't tested in 2.4 (m) |
| 013 two DB roles | 2.1, 4.9 | **ADR-013 says *two* roles. `architecture.md:131` and story 1.1 say *three* (runtime, migrate, limits).** 1.3 validates "the DB role pair" (m) |
| 016 SeaweedFS + `IfNoneMatch` | 0.2, 3.1, 7.11 | 3.1's AC assumes the 412 path. If 0.2's probe fails, 3.1 needs the stub fallback stated (m) |
| 018 email modes | 4.4 (sync auth), 8.1 (queued) | The queued pipeline is first needed in 5.3 (N-10), but no story builds it before 8.1 (M6). The branded mail layout (N-14) is first needed in 4.4, which isn't stated (m) |
| 020 concept scope | 2.2, 6.6 | None |
| 021 `imageKey` | 3.4, 7.2 | 6.6 (concept payloads) and 7.5 (admin concept payloads, D-05 in DV-12) don't mention `imageKey`. The E0 snapshot schema must allow the additive field, or Laravel fails NFR-M4 (m) |
| 022 design system | 1.7–1.9 | Select and Sheet primitives (see §5) |
| 023 polling hook | "built in 1.8" (coverage map) | 1.8 has no polling AC (M9) |
| 005 `__Host-lf_session` cookie | — | No AC (4.1 or 9.1) (m) |
| 026 log scrubber | 1.6 / 9.3 | No AC for the log processor (NFR-S3) (m) |
| 028 CI jobs | 1.1 (laravel-ci), 1.9 (ui), 0.9 (parity) | The `audit` job isn't owned by a story, and there's no Lighthouse job (m) |

No story contradicts ADR-003, 004, 006, 007, 010, 012, 014, 015, 017, 019, 024, 025 or 027.

## 8. Test strategy against later decisions (requested check 3)

**Still correct:**
- behavioural parity through page objects (§1);
- SeaweedFS in §3;
- L7, L7a and L7b on Laravel only, with baselines approved against the UX spec;
- the golden corpus and rule fixtures in §7;
- the L3 real-PG port;
- no visual parity against Next anywhere except the stale link text in `brownfield/index.md:13`.

**Stale or contradictory** (file:line in §13):
1. **`@deviation` semantics contradict themselves.** `02-test-strategy.md:18` and `01-feature-inventory.md:166` say deviation tests "run against Laravel only", then "the Next run fails if any of those tests *starts passing*", which requires running them on Next. Stories 0.7 and 0.8 run them on Next and expect failure. The only coherent rule is: run on both; on Next a reporter or `expected-next-failures.txt` inverts the expectation. Because "tests never branch on target", that inversion belongs in the config or reporter, not in test bodies (part of M4).
2. `§3` (line 46): Stripe is "deterministic and **offline**". It isn't, on Next (C1).
3. `§4` item 9 (line 61): "update the name **and VAT number**, see the VAT on invoices". VAT is out of scope (DV-3).
4. `§7` (line 99): "postgres, mailpit, **minio**".
5. `§2` L0 (line 24): "Larastan (max level achievable)". It's now level 9 (NFR-M1).
6. `§5` CI (line 90): only `laravel-ci` and `parity`. ADR-028 adds `ui` and `audit`.
7. `§5` gates, "Story done: the story's parity tags against Laravel **and** Next". That can't hold for Laravel-only layers (`@visual`, `@pg-race`, Pest) or for `@deviation` (M4).
8. `§3` (line 48): the coverage script excludes the O-series, while story 0.9 says "every inventory row". Rows covered only by Laravel-only layers (C-19 visual, A-19, X-15) can't have a Next test at the E0 baseline either (m).
9. The tag list (line 47) lacks `@client`, which `epics.md` (6.1, 6.2) and the inventory (C-01, C-02) use, and `@deviation` (m).
10. The L5 list (§4 items 1–23) isn't mapped to UX J1–J7, although PRD §3 says "each journey is an L5 parity test (§4)" (m).
11. No mention of the 10 MiB, 95 MB or 100 MiB limits: correct. There's no process-local limiter or `POSTMARK_TOKEN` in the test strategy. The stale limiter wording is in brownfield (§13).

## 9. E0 executability against the current Next.js app (requested check 4)

Spot checks of `apps/web` (read-only):

| Seam | What the code does today | Consequence for E0 |
|---|---|---|
| **Email → Mailpit** | Postmark **HTTP API** via `fetch("https://api.postmarkapp.com/email")` in **two** places: `src/lib/auth/mail.ts:3,41` and `src/lib/project-lifecycle-email.ts:9,117`. There's no SMTP library in `package.json`. `auth/mail.ts:17` throws if `POSTMARK_SERVER_TOKEN`/`POSTMARK_FROM` are missing | "SMTP → Mailpit" (0.3, test strategy §7) would mean adding a dependency (nodemailer) to a frozen app. **Smaller seam:** an env-overridable `POSTMARK_API_URL` (a 2-line change), pointed at a tiny Postmark-compatible shim in `tests/parity/adapters/` that relays to Mailpit SMTP. The shim also gives the **failure injection** that A-11, 4.4 and NFR-R5 tests need on Next (return 5xx on demand). Mailpit has no Postmark API |
| **R2 → SeaweedFS** | `src/lib/storage/r2.ts:107–113` builds the endpoint from `R2_ACCOUNT_ID` (must match `^[a-f0-9]{32}$`), with no `forcePathStyle` | The seam needs `R2_ENDPOINT` plus path-style when it's set, and a fake 32-hex account ID. Presigned URLs are signed for the endpoint host, so the Playwright browser must reach SeaweedFS at the **same host name** Next signs with (e.g. `localhost:8333`, not the compose service name) |
| **`parity:seed`** | The existing seed guard `src/lib/local-dev-fixture-guard.ts:17` (`requirePrivateLocalCluster`) is bound to the owner's private cluster: port 45232, a unix socket, a `0700` directory, three 48-hex passwords | It **can't** be "ported" or reused against `docker-compose.test.yml` Postgres. 0.4 needs a new guard (M2). Postgres init must also create Next's `lf_runtime`/`lf_migration` roles so the A-19 trigger and runtime grants behave as in production |
| **Stripe** | `src/lib/checkout-fulfillment.ts:130` calls `stripe.checkout.sessions.listLineItems(sessionId)` on **every** package fulfilment. `webhook/route.ts:145` calls `sessions.retrieve` for async success. Invoices (`client-invoices.ts:72,92,137`) and admin health (`accounts.retrieve`) call Stripe. **Price IDs are hard-coded** in `src/lib/stripe-price-allowlist.ts:7–30` | Locally signed fixtures with made-up session IDs **can't be fulfilled on Next**. Each fixture must reference a real **test-mode** Checkout Session whose line items use price IDs in the hard-coded map. If those IDs are live-mode prices (unverified), test-mode sessions can't use them, so Next needs a price-ID override seam that isn't on the allowed list. Invoice parity (K-11, C-18, D-19) needs real completed test payments. **Critical (C1)** |
| **Run mode** | `npm start` runs `auth-proxy-preflight --production`. X-04 allows HTTP only on loopback in dev | Parity on Next runs `next dev` (or production with HTTPS). Production-only behaviours (A-17 fail-closed, `__Host-` cookie, HSTS) can't be parity-tested and must be Pest/Vitest plus L9. State this in §3 (m) |
| **Freeze rule** | DECISIONS 2026-11-18 (line 32): "frozen except for changes that add a parity test and inventory row". Test strategy §7: seams are "the only allowed `apps/web` changes … each with an inventory note" | There's no inventory row or section to hold those notes, and no DECISIONS entry approving the specific seams. With C1 there may be a fourth seam (Stripe price override) (M1) |

0.1, 0.2 and 0.6 are executable as written. 0.3, 0.4 and 0.5 are executable once M1, M2 and C1 are fixed. 0.7–0.9 depend on them.

## 10. Documentation protocol for the first story (requested check 6)

- **Story location `docs/laravel-migration/stories/<epic>-<story>-<slug>.md`:** this matches BMAD's `{{story_key}}.md` (e.g. `0-1-parity-suite-scaffold.md`). **But** `_bmad/config.yaml` sets `implementation_artifacts: …/_bmad-output/implementation-artifacts` (git-ignored), and every phase-4 workflow reads `{project-root}/_bmad/bmm/config.yaml`, which doesn't exist. Run as-is, `sprint-planning` and `create-story` would either fail to resolve config or write `sprint-status.yaml` and the story files where they won't be committed (M3).
- **The `epics.md` headings are "Epic E0:"** while the BMAD sprint-planning parser expects "Epic N". Check that the generated keys are `epic-0` / `0-1-…` and not `epic-E0` (m).
- **Conversion-record template** (`templates/story-conversion-record.md`): it exists and is actionable. But it's written for *conversion* stories. For E0 (test-only, Next-only) and E1–E3 (no Next feature), "Next.js source read", "Behaviour notes" and "Deviations" are mostly n/a. Add one line saying how E0 fills it in (behaviour notes = the Next behaviour the test pins; Laravel implementation = "none") (m).
- **DoD for E0 is unsatisfiable as written (M4).** It requires:
  - "parity tags green on Laravel *and* Next";
  - "inventory set to Verified", which means passing against both apps (`01-feature-inventory.md:6`);
  - "Laravel file references".

  E0 needs its own DoD: Next green except `expected-next-failures.txt`; inventory **Tag/test** filled in; ledger rows mapped; baseline recorded.
- **The inventory has no "test IDs" column,** although the plan (§5, "with test IDs filled in") and the protocol require them (m).
- **The `handoff.md` baseline isn't re-verified.** The 95/614 figures come from `docs/TODO.md`. Step 2 of the session loop requires running it before 0.1 (m).
- `sprint-status.yaml` and `tests/parity/converted-tags.txt` don't exist yet. That's expected (sprint planning and 0.9 create them). Story 0.1 should create `converted-tags.txt` empty, so the protocol's end-of-session step 7 works from the first story (m).

## 11. Owner-dependent open items, by epic they block (requested check 7)

| Epic / story | Owner input | Blocking? |
|---|---|---|
| **E0** 0.3 | Approve the specific `apps/web` seams as freeze exceptions (a DECISIONS entry) | Yes, for 0.3 |
| **E0** 0.5, 0.7, 0.8 | **Stripe test-mode secret key and webhook secret** (as GitHub Actions secrets for CI). Confirm whether the hard-coded price IDs in `stripe-price-allowlist.ts` are test or live. If live, create test-mode equivalents and approve a price-override seam | Yes (C1) |
| **E0** (where it runs) | The remote worker `setup-token` on the MacBook (handoff: "paused by the owner") | Only if work runs there |
| **E1** (all) | Review and accept the architecture and the 28 ADRs, all `Proposed` | Yes, for E1 (the stack is fixed here) |
| **E1** 1.1 | PHP 8.5 security release ≥ 2026-11-19 (ADR-001) is **tomorrow**. The pin can't be satisfied today | Timing only |
| **E1** 1.7 | **Sfizia licence for app use** (UX §15.4, architecture §7 gap 4). Otherwise, choose a fallback display face | Yes, for 1.7 baselines |
| **E5** | Stripe test-mode products and prices for the Laravel config (`config/logo_fountain.php`), a test promotion code for DV-1 | Yes, for 5.1 and 5.5 tests |
| **E6/E7** | **Approve the look of key screens** (plan 2.2 gate: "before E6/E7 start") | Yes |
| **E6** 6.1 | One-project shortcut approval (UX §15.3, PRD §8) | Yes, for 6.1 |
| **E6** 6.2, 6.6, 6.10 | Turnaround copy for empty states (UX §15.2) | Soft (placeholder copy, then baseline re-approval) |
| **E6** 6.4 | Brief reference uploads now or post-launch (UX §15.5) | Soft (default: post-launch; log it) |
| **E9** | Forge, Hetzner, Cloudflare DNS, Storage Box, the R2 backup bucket and tokens, live secrets, the live Stripe webhook on `2026-02-25.clover`, live R2 acceptance, admin bootstrap on the live DB, server size, the launch date, 5 usability participants, manual screen-reader passes | Yes, for 9.1–9.5 |

## 12. Findings

Severity: **critical** = a story as written can't be executed, or a wrong build would result · **major** = must be fixed before the affected story starts · **minor** = fix when convenient (before the named story).

| # | Sev | Location | Issue | Exact fix |
|---|---|---|---|---|
| C1 | critical | `epics.md` 0.5 ("offline and deterministically"); `02-test-strategy.md:46`; `apps/web/src/lib/checkout-fulfillment.ts:130`, `stripe-price-allowlist.ts:7–30` | Next fetches line items from Stripe on every package fulfilment, and its price IDs are hard-coded. Locally signed fixtures with made-up session IDs can't be fulfilled on Next. If the hard-coded IDs are live prices, test-mode sessions can't use them at all. Invoice tests need real completed test payments. The E0 webhook, checkout and invoice parity can't be built as written | In 0.5, replace "tested offline" with: "Fixtures reference **real Stripe test-mode Checkout Sessions** created by `tests/parity/stripe/create-session.mjs` (test key, allowlisted test price IDs). The fixture event is signed locally and claims `payment_status` per scenario. Invoice/receipt tests (`@invoices`) use sessions completed once through hosted Checkout (`@stripe-live-test` setup script) and recorded by ID in `tests/parity/fixtures/stripe/`." Add an AC: "Given the hard-coded price IDs, then `create-session.mjs` succeeds in test mode, or the price-override seam (M1) is in place." Owner: provide test keys and confirm the price-ID mode. Update test strategy §3: "deterministic; online to Stripe test mode (not offline)" |
| M1 | major | `epics.md` 0.3; `02-test-strategy.md` §7; DECISIONS line 32 | The seam scope is vague. "SMTP → Mailpit" needs a new dependency in a frozen app. The R2 seam needs an endpoint, path-style and host reachability. There's no place to record freeze exceptions and no decision approving them | Rewrite 0.3: "Seams (each ≤ ~10 lines, inert unless `PARITY_MODE=1`): (a) `POSTMARK_API_URL` override in `lib/auth/mail.ts` and `lib/project-lifecycle-email.ts`, pointed at `tests/parity/adapters/postmark-shim` (relays to Mailpit SMTP; `/__fail` toggles 5xx for A-11 tests); (b) `R2_ENDPOINT` + `forcePathStyle` in `lib/storage/r2.ts` (SeaweedFS at a host the browser can reach); (c) `parity:seed` (M2); (d) only if C1 requires it, `STRIPE_PRICE_OVERRIDES_JSON`." Add inventory row **O-09 "Parity test seams (freeze exceptions)"** listing each seam and file. Log the DECISIONS entry approving (a)–(d) |
| M2 | major | `epics.md` 0.4; `02-test-strategy.md:41` ("port `lib/local-dev-fixture-guard.ts`") | The existing guard (`local-dev-fixture-guard.ts:17`) is bound to the owner's private cluster, so it can't protect a compose database. "Non-local" is undefined | 0.4 AC: "The seed refuses unless `PARITY_MODE=1`, the `DATABASE_URL` host is `127.0.0.1`/`localhost`/`postgres`, the database name is `lf_parity`, and table `parity_marker` exists (created by the compose init script). Unit-tested for each refusal." Put the seed in `apps/web/scripts/parity-seed.mjs` (seam c), with scenario definitions shared at `tests/parity/fixtures/scenarios/*.json` (reused by 2.6). After: 0.2, 0.3 |
| M3 | major | `_bmad/config.yaml`; phase-4 `workflow.yaml` files (`config_source: _bmad/bmm/config.yaml`, which doesn't exist) | `sprint-planning` and `create-story` would write `sprint-status.yaml` and the story files to the git-ignored `_bmad-output/implementation-artifacts`, or fail to resolve config. The protocol's locations would silently not be used | Before BMAD 4: set `planning_artifacts: …/docs/laravel-migration` and `implementation_artifacts: …/docs/laravel-migration/stories` in `_bmad/config.yaml` (and provide `_bmad/bmm/config.yaml`, or confirm the plugin resolves `_bmad/config.yaml`). Add to `handoff.md` "Verify the baseline": `test -f docs/laravel-migration/stories/sprint-status.yaml` after sprint planning |
| M4 | major | `epics.md:13` (standard DoD); `03-documentation-protocol.md` §3; `02-test-strategy.md:18,86`; `01-feature-inventory.md:6,166` | The single DoD says "parity tags green on Laravel *and* Next; inventory Verified". That's impossible for E0 (no Laravel), for Laravel-only layers (`@visual`, `@pg-race`, Pest) and for `@deviation` tests (which must fail on Next). The `@deviation` rule contradicts itself ("Laravel only" vs "the Next run fails if they start passing") | Add three DoD variants to `epics.md` §Overview and protocol §3. **(E0)** "Green on Next except the entries in `expected-next-failures.txt`, which must fail. Inventory Tag and test titles filled in; status stays `Not started`." **(Laravel-only layers)** "Green on Laravel; no Next run." **(conversion)** as now, where "green on Next" means "the Next result matches `expected-next-failures.txt`". Reword test strategy §1: "`@deviation` tests run on both targets. On Next, the reporter expects them to fail (from `expected-next-failures.txt`), and a pass fails the run." Same wording in inventory line 166 |
| M5 | major | `epics.md` 2.5; NFR-S4 (`prd.md:119`); ADR-009; `research-technical.md:319,467`; `architecture.md:185` | Several different limiter contracts are written down: (1) a dedicated `pgsql_limits` connection; (2) "refuses inside an open transaction"; (3) "keeps counting when the surrounding transaction rolls back"; (4) "called before the fence opens". A dev agent can't tell which connection the assertion checks, and the login path in 4.3 depends on it | Replace 2.5's AC: "`RateLimits` runs only on the `pgsql_limits` connection (single-statement upsert, sha256 keys). It asserts `DB::connection('pgsql_limits')->transactionLevel()===0`. Auth actions call it **before** `Locks::credential()` opens the fence. **Given** a failed login whose fence transaction rolls back, **then** the failure is still counted (L3). **Given** N parallel processes hitting one key, **then** exactly `cap` succeed (L3). Window, cap and clear-on-success semantics match `rate-limit.ts` tests." Align NFR-S4's wording: "…even when the auth operation it guards rolls back" |
| M6 | major | `epics.md` 5.3, 6.5–6.10, 7.5–7.9, 8.1; ADR-018/019 | Queued `afterCommit` lifecycle mail, `email_sent:*` markers (X-18), the branded base layout (N-14) and the failing-transport test seam are needed from 5.3 onwards, but are "finalised" only in 8.1 ("After: built incrementally") | Add **story 2.7 "Lifecycle mail pipeline"** (After 2.4, 1.1): base branded mailable (N-14 layout, HTTPS-only CTAs), a `LifecycleMail::sendOnce(type, project, …)` with an X-18 marker inside the action transaction and dispatch `afterCommit`, retries with backoff, `already_sent`/`skipped` results, a Pest failing-transport test (NFR-R5 lifecycle half). Covers X-18, DV-8, N-14 (base). Make 4.4 and 5.3 depend on it. 8.1 becomes "verify all templates and the matrix" with After 5.3, 6.5–6.10, 7.5–7.9 |
| M7 | major | `epics.md` story **Tags**; `02-test-strategy.md` §3, §5 | Tags are per domain, not per story or layer. 3.2/3.3 (`@uploads`) would pull HTTP upload tests against admin endpoints that don't exist until E7. 4.3–4.8 (`@auth`) pull L5 browser journeys whose screens arrive only in 4.9. 5.1–5.3 have no screens. "Story tags green on Laravel" is unachievable at those stories | Add layer tags (`@api` for L4/L6, `@ui` for L5) and define a story's gate as an explicit grep in its story file, e.g. 3.2: `@uploads&@unit` (Pest) only, with the HTTP subset deferred to 7.5/7.8; 4.3: `@auth&@api`; 4.9: `@auth&@ui`. `tests/parity/converted-tags.txt` holds these expressions. State in test strategy §5: "A tag goes into `converted-tags.txt` only when every test it selects has its prerequisites built" |
| M8 | major | `epics.md` 5.6 (After 6.2), 6.1 (needs C-02 from 6.2) | Forward dependencies: E5 can't finish in order, and 6.1 can't be built before 6.2 | Move 5.6 into E6 after 6.3 (renumber). Swap 6.1 and 6.2, or move `GET /api/projects` (C-02 list) into 6.1. Update the FR58 row of the coverage map ("6.2, 5.4") |
| M9 | major | `epics.md` 1.8; coverage map row FR58; ADR-023; FR58 | The shared `usePolling` hook (hidden-tab pause, backoff, `aria-live`, "Reconnecting…" after 3 failures) is claimed for 1.8, but 1.8 has no such AC and no story tests it. `usePrivateImage` (3.4) and `useTheme` (1.7) are fine | Add to 1.8 (or the new split 1.8c): "**Given** 3 consecutive poll failures, **then** a non-blocking 'Reconnecting…' notice shows and polling continues with backoff. **Given** a hidden tab, **then** polling pauses. **Given** new items, **then** they're announced via `aria-live=polite` without moving focused content (Vitest with fake timers)." Add per-screen interval ACs: 6.2 10 s, 7.2 2 s, 7.10 2.5 s, 5.4 2 s → 10 s after 45 s |
| M10 | major | `ux-design.md` §5.3; `epics.md` 6.1, 6.3, 6.10; `02-test-strategy.md` §1 | UX-driven *behaviour* changes (the one-project landing, admins redirected to the project workspace, Files grouping, snooze) will make behavioural parity tests diverge on Next. They're neither page-object-abstracted by rule nor tagged `@deviation` | Add to test strategy §1: "Navigation and IA changes from DV-UX are absorbed by page objects (e.g. `portal.openProject(name)` works whether or not a list is shown). Where a test asserts the landing URL or redirect target, it's tagged `@deviation` (DV-UX) and listed in `expected-next-failures.txt`." Add the 6.1 AC: "Given an admin opens `/project/{id}`, then they land on `/admin/projects/{id}` (`@deviation` DV-UX)" |
| M11 | major | `epics.md` 1.2, 7.4, 7.6, 7.7, 7.10 | No acceptance criteria. FR38, FR40, FR41, FR45 and FR46 depend on them | 1.2: "**Given** `apps/portal/AGENTS.md`, **then** it lists every architecture §5 rule, and `project-context.md` exists at `docs/laravel-migration/`." 7.4: "Given a submitted brief, the rendered sections match the brief document (all fields, version, date); before submission, the empty state." 7.6: "Publishing a draft consumes a concept slot, moves the first visible concept's project to CONCEPTS_READY, posts the system message and sends N-04 once. Re-publishing is idempotent. Deleting writes `concept_deleted` and keeps the objects; a disallowed stage is rejected with the documented code." 7.7: "Mark delivered moves reserved → consumed, sends the client email once (per-request marker), and removes the inbox item." 7.10: "The audit log polls every 2.5 s and filters by type (latest 100). The admin can post in the project thread and reply in a concept thread; N-06 is sent once" |
| M12 | major | `epics.md` E4–E7 DoD; `02-test-strategy.md:14` (`pages/laravel/*`) | No story builds the **Laravel page-object implementations**. Without them no L5 test can run against Laravel | Add to the conversion DoD: "Laravel page-object methods used by this story's journeys are implemented in `tests/parity/pages/laravel/` (accessible locators first; `data-testid` only in Laravel objects). The shared journeys are unchanged" |
| M13 | major | `epics.md` 0.7, 0.8 | 0.8 is several stories (23 L5 items, 7 UX journeys, abuse cases, every Next page object, and all `@deviation` tests). 0.7 is two (49-endpoint contract plus the generated matrix). Only DV-7 deviation tests are required | Split per §14. Add to 0.9's coverage gate: "every DV row has ≥ 1 `@deviation` test listed in `expected-next-failures.txt`" |
| m1 | minor | `epics.md:19` | "FR1–FR57" and "M1…M3" omit FR58, NFR-M4 and NFR-O1 (the map at line 33 and line 412 already say 1–58) | Change to "FR1–FR58" and "M1…M4, O1" |
| m2 | minor | `architecture.md:20`, `:186` | "57 FRs". FR58 isn't in the §7 coverage line | "58 FRs"; add "FR58 → 023" |
| m3 | minor | ADR-013 vs `architecture.md:131`, `epics.md:117`, 1.3 ("DB role pair") | Two roles vs three (runtime, migrate, limits) | Decide: either `pgsql_limits` uses the runtime role (say so in ADR-009, drop "three roles"), or supersede ADR-013 with a three-role ADR and update 1.3 |
| m4 | minor | `epics.md:119` (1.1) | "Larastan (agreed level)" | "Larastan level 9" (NFR-M1, DECISIONS line 46) |
| m5 | minor | 6.3 AC vs C-04 | "24 h" vs "per session" | "'Not now' hides the panel for 24 h within the browser session (`sessionStorage` key with expiry), as `revision-purchase.tsx` does" |
| m6 | minor | 6.10 | FR30's invoices-in-Files has no AC and no dependency on 5.8 | Add AC "the Files tab lists this project's invoices and receipts (the resolver from 5.8)"; After +5.8 |
| m7 | minor | 7.1 | FR35's search, filter, unread badges and land-on-section aren't in the AC | Add them |
| m8 | minor | 7.11 | The public `/api/health` → `{ok:true}` isn't in the AC | Add it |
| m9 | minor | 6.6, 7.5 | The `imageKey` in concept payloads (ADR-021, DV-12 rows C-08, C-09, D-05) isn't in the AC | Add "concept payloads carry `imageKey`" and a schema-allowed additive field in the 0.7 snapshot schema |
| m10 | minor | 4.1 or 9.1 | The `__Host-lf_session` cookie (ADR-005) has no AC | Add to 4.1: "in production config the session cookie is `__Host-lf_session`, Secure, HttpOnly, SameSite=Lax" |
| m11 | minor | 1.6 / ADR-026 / NFR-S3 | No AC for the log scrubber processor or the CI log grep | Add to 1.6: "the log processor redacts tokens, signed URLs and secrets (Pest)". Add to 1.1 CI: "grep the test-run logs for token and URL patterns" |
| m12 | minor | NFR-P2 / ADR-028 | "Lighthouse in CI" has no job or story | Add a `lighthouse` job to 1.9 (or 6.2), running on the seeded Overview, median of 3 runs |
| m13 | minor | ADR-022 vs UX §11 | Select★ and Sheet★ aren't in the Radix list | Add `@radix-ui/react-select` and a dialog-based sheet to ADR-022 (a new superseding ADR, or a Consequences note) |
| m14 | minor | 5.7 / 7.2 | The UX J7 "Payment card → Reprocess" UI has no story | Add an AC to 7.2: "the properties column shows order or payment status with a Reprocess action (5.7) that explains it sends the customer email (DV-6)" |
| m15 | minor | 3.1 | It assumes SeaweedFS returns 412. There's no fallback if 0.2's probe fails | Add "If the 0.2 probe recorded the fallback, the collision test runs at L3 with the stub and the HTTP check moves to L9" |
| m16 | minor | 2.4 | The `Db::serializable` "no nesting" rule isn't tested | Add "a nested call throws" |
| m17 | minor | 4.4 | It's the first emailing story, but doesn't say it creates the branded mail layout (N-14) | Add "creates the base branded mail layout (N-14), reused by 2.7/8.1" |
| m18 | minor | 1.4 | The X-01 exemptions aren't named in the AC | Add "exempt: `/api/stripe/webhook`, `/api/checkout/magic-link`, `/api/checkout/resend-magic-link`, `/checkout/start`, GETs, `/api/health`" (verify against `brownfield/auth-and-security.md`) |
| m19 | minor | `02-test-strategy.md:47` | The tag list lacks `@client` and `@deviation` | Add them (and `@api`, `@ui` per M7) |
| m20 | minor | `02-test-strategy.md:48` vs 0.9 | The coverage-script scope differs (O-series excluded vs "every row"), and Laravel-only rows can't have a Next test | 0.9: "every row except the O-series has a parity test, **or** a recorded Laravel-only destination (L1–L3, L7) in the ledger/inventory" |
| m21 | minor | `02-test-strategy.md` §3 | The runtime mode of each target isn't stated. Production-only behaviour can't be parity-tested | Add "Next runs `next dev` on loopback; Laravel runs `APP_ENV=testing`. Production-only behaviour (A-17, X-04 HTTPS, cookies, HSTS) is proven by Pest/Vitest plus L9" |
| m22 | minor | `03-documentation-protocol.md`, template | The template doesn't say how test-only or foundation stories fill "Next.js source read", "Behaviour notes" and "Deviations" | Add one line: "E0: behaviour notes = the Next behaviour each test pins; Laravel implementation = none. E1–E3: Next source = the module being ported, or 'none'" |
| m23 | minor | `01-feature-inventory.md` | There's no test-ID column, although plan §5 and the protocol require "test IDs filled in" | Add a "Tests" column, or define that the Laravel column holds the test titles too |
| m24 | minor | `handoff.md:217` | The baseline isn't re-verified | Run the "Verify the baseline" commands before 0.1 and record them |
| m25 | minor | `epics.md` headings "Epic E0:" | The BMAD sprint-planning parser expects "Epic N:" | Check the generated keys after sprint planning, or rename the headings to "Epic 0: …" |
| m26 | minor | `epics.md` §Overview | Technical epics (E0–E3, E8, E9) and all-tables-up-front (2.1) deviate from BMAD practice without a note | Add one sentence: "Technical epics and the single schema story are deliberate: parity-gated brownfield rewrite" |
| m27 | minor | `epics.md` 2.6, 8.1, 9.1 | ACs or Afters can't be verified when the story ends ("once they exist", "built incrementally", "feature-complete") | See §6.2 fixes |

## 13. Stale statements (file:line)

| # | File:line | Stale text | Should say |
|---|---|---|---|
| 1 | `02-test-strategy.md:99` | "postgres, mailpit, **minio** (bucket bootstrap)" | "postgres, mailpit, seaweedfs (bucket bootstrap)" |
| 2 | `02-test-strategy.md:61` | "update the name **and VAT number**, see the VAT on invoices" | "update the name, see the invoices" (VAT is DV-3, out of scope) |
| 3 | `02-test-strategy.md:46` | "deterministic and **offline**" | "deterministic; online to Stripe test mode" (C1) |
| 4 | `02-test-strategy.md:18` | "run against Laravel only … The Next run fails if any … starts passing" | the M4 wording |
| 5 | `02-test-strategy.md:24` | "Larastan (max level achievable)" | "Larastan level 9" |
| 6 | `02-test-strategy.md:90` | CI jobs `laravel-ci` and `parity` only | add `ui`, `audit` (ADR-028) |
| 7 | `01-feature-inventory.md:166` | "run against Laravel only, and are expected to fail against Next" | the M4 wording |
| 8 | `01-feature-inventory.md:47` (K-07) | "(verify the current values in code during Phase 0)" | Verified: 1/1, 2/2, 3/3 (`lib/entitlements.ts:14–16`) |
| 9 | `test-port-ledger.md:114` | "Pest unit (S3 mock) + L3 **MinIO**" | "+ L3 SeaweedFS" |
| 10 | `00-migration-plan.md:120` | E0 "Mailpit, **MinIO**, Stripe fixture signing" | "Mailpit, SeaweedFS, …" |
| 11 | `00-migration-plan.md:89` | "MinIO conditional-write support for tests" | historical row; append "(→ SeaweedFS, research §6.2)" |
| 12 | `00-migration-plan.md:59` | CSRF "OPEN → architecture ADR" | "DECIDED: ADR-008" |
| 13 | `00-migration-plan.md:88` | brief "non-goals (no new features, **no redesign**)" | the redesign is in scope (DV-UX) |
| 14 | `00-migration-plan.md:3` | "Next: PRD validation fixes → epics and stories (3.2) → readiness (3.3)" | v0.7: 3.2 done, 3.3 done → BMAD 4 |
| 15 | `product-brief.md:43` | "DV-1…DV-11" | "DV-1, DV-2, DV-4…DV-9, DV-11…DV-13" |
| 16 | `prd.md:11` | `status: Draft … (validate with bmad-bmm-validate-prd next)` | "Validated 2026-11-18 (PASS WITH FIXES, fixes applied)" |
| 17 | `prd.md:154` | "PRD validation … must confirm FR → inventory coverage before architecture is finalised" | "Confirmed 2026-11-18 (reports/prd-validation-report.md)" |
| 18 | `prd.md:149` and `ux-design.md:343` | the **Files tab** "pending explicit owner approval" | the Files tab is decided (DECISIONS 2026-11-18, line 43); only the one-project shortcut is pending |
| 19 | `architecture.md:20` | "57 FRs" | "58 FRs" |
| 20 | `architecture.md:193` | "ready for epics … once … the PRD validation fixes are applied" | the fixes are applied; pending owner review only |
| 21 | `epics.md:19` | "FR1–FR57"; "M1…M3" | "FR1–FR58"; "M1…M4, O1" |
| 22 | `adr/ADR-013…md:8` vs `architecture.md:131`, `epics.md:117` | "Two DB roles" vs "three roles" | one consistent statement (m3) |
| 23 | `brownfield/data-model-and-ops.md:34` | "Or use the Laravel cache `RateLimiter` on the DB or Redis store (decide in the architecture ADR)" | "Decided: ported PG buckets on `pgsql_limits` (ADR-009)" |
| 24 | `brownfield/data-model-and-ops.md:77` | "(app, queue worker, postgres, mailpit, **minio**)" | "seaweedfs" |
| 25 | `brownfield/auth-and-security.md:93` | "Laravel must use a shared store (**cache** or DB)" | "the ported PG limiter (ADR-009); not the cache" |
| 26 | `brownfield/index.md:13` | "visual parity targets" | "screens needing L7 baselines (see ui-pages §5)" |

Also noted, not stale but worth a cross-reference:
- `brownfield/storage-and-uploads.md:44` ("Over **100 MiB** → `FILE_TOO_LARGE`") correctly describes Next. Add "(Laravel: 95,000,000 bytes, DV-13)" so it isn't ported.
- `research-technical.md:379` says §3 and §7 "say MinIO". §3 is fixed and §7 isn't.
- Governance: `RISKS.md:15` still says "MinIO may not honour… verify MinIO support in E0". Add a superseding risk line (append-only rule), not an edit.
- No stale "visual parity against Next", "process-local limiter" (as a Laravel design), `POSTMARK_TOKEN` or 100 MiB ZIP target was found elsewhere. `research-technical.md:230` documents the `POSTMARK_API_KEY` correction, and `data-model-and-ops.md:65` already uses `POSTMARK_API_KEY`.

## 14. Recommended story splits

| Story | Split into | Rationale |
|---|---|---|
| **0.6** | 0.6a golden upload corpus + Next Vitest runner (X-12) · 0.6b shared rule fixtures (state machine, safe-next, brief normalisation, display status, entitlement usage) | Two independent fixture sets with different owners in E2/E3 |
| **0.7** | 0.7a L4 contract suite for auth, checkout and webhook endpoints · 0.7b L4 for client project endpoints, plus the snapshot JSON schema (with the additive `imageKey` allowed) · 0.7c L4 for admin endpoints · 0.7d generated L6 matrix (endpoint × 4 actors × concept status) + DV-7 `@deviation` | 49 endpoints plus a generator is several days of agent work, and each part has its own fixtures |
| **0.8** | 0.8a page-object layer (`pages/next/*`), mail and storage adapters, journey 1–2 (purchase, setup, sign-in) · 0.8b journeys 3–6 (brief, concepts, revisions, upsell) · 0.8c journeys 7–11 (approval, finals, messages, settings, reset, logout) · 0.8d admin journeys 12–18 · 0.8e abuse cases 19–23 + every remaining DV `@deviation` test + `expected-next-failures.txt` | The largest story in the plan. Split along the test strategy's own §4 groups, and map each part to UX J1–J7 |
| **1.1** (optional) | 1.1a skeleton, compose, pins, Pint, Larastan 9, Pest · 1.1b CI workflow (`laravel-ci`, `audit`, the log grep) | CI wiring fails for different reasons than the app skeleton |
| **1.8** | 1.8a form and action primitives (Button, Field, inputs, Dialog/Confirm, Menu, Sheet, Toast, Inline alert) · 1.8b status components (Turn banner, Status pill, Stage tracker, Allowance meter, Empty state, Skeleton) · 1.8c media and data (Concept card/viewer, File card, Upload dropzone, Thread, Data table, Properties panel) + `usePolling` (M9) | About 25 components with variant × state × theme × axe × keyboard each |
| **4.9** | 4.9a `admin:bootstrap` CLI (A-12, `pgsql_migrate`) · 4.9b auth screens (sign-in, set/reset, magic confirm) with L5 `@auth&@ui` and L7 baselines | A CLI and UI screens share nothing |
| **6.2** (optional) | 6.2a snapshot API + JSON schema + contract (C-02, C-16) · 6.2b Overview page (turn banner, tracker, allowances, activity, polling) | API vs screen. Also unblocks 6.1 (M8) |
| **7.5** | 7.5a upload a new concept with durable receipts, the advisory lock and ambiguous-commit recovery (D-05, D-10, X-13, X-19, L3) · 7.5b replace a concept · 7.5c revision upload delivering pending requests + DV-9 N-05 email once per upload (D-08) | Three different transactions, error-code sets and L3 races |
| **7.8** | 7.8a finals upload and replace (D-11, X-13, DV-11, DV-13, newest-asset selection, old links valid) · 7.8b notify retry and admin download (D-12, D-13, F-12 re-notify rule) | Upload publication vs notification/download |
| **9.4** (optional) | 9.4a performance (k6, Lighthouse) · 9.4b usability + manual accessibility passes (owner-run) · 9.4c three consecutive full parity runs + 7 nights L3 + audit | Different owners (agent vs owner) and time windows |
| **New 2.7** | Lifecycle mail pipeline (M6) | Missing foundation |

## 15. Recommended next steps (in order)

1. **Owner:**
   - provide the Stripe test-mode key and webhook secret;
   - confirm the price-ID mode in `apps/web/src/lib/stripe-price-allowlist.ts`;
   - approve the `apps/web` seams (DECISIONS);
   - review the architecture and ADRs;
   - answer the Sfizia licence question.
2. Apply the doc fixes **C1, M1–M4** (E0 and the protocol) and fix the BMAD config paths (M3). Then run **BMAD 4 sprint planning** into `docs/laravel-migration/stories/sprint-status.yaml`, and start `create-story` with **0.1**. 0.1, 0.2 and 0.6 can proceed in parallel with the owner items.
3. Before E1:
   - apply **M5–M9, M11–M13** in `epics.md` (the limiter contract, the new 2.7, the layered tags, the reorders, polling ACs, missing ACs, Laravel page objects, the splits);
   - fix the 26 stale statements in §13;
   - re-run the coverage script over `epics.md` after the renumbering.
4. Before E6/E7: the owner's key-screen approval, the one-project shortcut decision, turnaround copy and M10 (DV-UX classification).

**Final note.** This assessment found **41 issues** (1 critical, 13 major, 27 minor) plus 26 stale statements, across eight categories: Stripe/E0 seams, the DoD and gating model, dependency order, story sizing, missing ACs, ADR-to-story drift, the test-strategy wording, and the BMAD config. Requirements coverage itself is complete. The issues are about *executability and ordering*, not missing scope.
