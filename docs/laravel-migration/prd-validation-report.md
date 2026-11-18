---
validationTarget: docs/laravel-migration/prd.md
validationDate: 2026-11-18
workflow: bmad-bmm-validate-prd (run autonomously, no menus)
inputDocuments:
  - docs/laravel-migration/README.md
  - docs/laravel-migration/product-brief.md
  - docs/laravel-migration/01-feature-inventory.md
  - docs/laravel-migration/ux-design.md
  - docs/laravel-migration/research-technical.md
  - docs/laravel-migration/brownfield/index.md (plus auth-and-security, api-client, api-admin, ui-pages, business-rules-and-notifications)
  - DECISIONS.md / ASSUMPTIONS.md (2026-11-18 entries)
validationStepsCompleted: [discovery, format-detection, density, brief-coverage, measurability, traceability, implementation-leakage, domain-compliance, project-type, smart, holistic-quality, completeness, report]
holisticQualityRating: '4/5 - Good'
overallStatus: Warning
verdict: PASS WITH FIXES
---

# PRD validation report: Logo Fountain portal on Laravel

**Verdict: PASS WITH FIXES.** No critical findings. 7 major and 19 minor findings. The PRD is usable for architecture once the major fixes are in. It's dense, well structured, traceable to the inventory in both directions, and its delegation model works: FRs say *what* and cite the rows that hold the exact limits, codes and copy. The major findings fall into four groups. One NFR contradicts the auth-email contract. Two guarantees the whole parity strategy depends on aren't stated: the API contract and automatic refresh. One decided deviation (DV-5) has no FR. And several NFRs don't say how they're measured.

> **Note on the input version.** I validated the working tree, which includes uncommitted edits made while this ran: FR53 now cites DV-13 (a 95 MB final ZIP cap), the inventory has a DV-13 row, and plan §3 records the hosting decision (Forge on Hetzner, a Cloudflare proxy, pgBackRest with 30 days of PITR plus 12 monthly backups, a quarterly drill, email alerts). The findings take those edits into account.

## 1. Check summary

| Check (BMAD step) | Result | Notes |
|---|---|---|
| Format detection | Pass | BMAD standard: executive summary, success criteria, journeys, domain and project type, scope, FRs, NFRs, assumptions, traceability |
| Information density | Pass | Very little filler. The FRs are one sentence each with citations |
| Product brief coverage | Warning | The brief's "same JSON API contracts" (Solution), "monitoring basics" and "queue worker" (In scope) and the admin "1 click" UX target have no PRD requirement (M2, m10, m13) |
| Measurability (FR) | Pass | 57 FRs, all with a clear actor and testable. Weak spots: FR44, FR47, FR49, FR53 (see findings) |
| Measurability (NFR) | Warning | 10 of 22 NFRs don't say how they're measured, or use undefined terms (M7) |
| Traceability, inventory → PRD | Pass | Every A, K, C, D, N, X and O row is cited. N-06…N-11, O-02 and O-03 are covered by the ranges N-04…N-12 and O-01…O-04 (re-checked by grep) |
| Traceability, PRD → inventory | Pass | Every FR and NFR cites a row, a DV- or a ux § reference. FR56 cites "release gates", which isn't a defined reference (m14) |
| Decided-deviation coverage | Warning | DV-1, 2, 4, 6, 7, 8, 9, 11, 12 and 13 are expressed, and DV-3 is in scope-out. **DV-5 has no FR** (M3). DV-UX is covered only implicitly through NFR-A2 |
| Journeys → FRs | Pass | J1 → FR12/14/16/3/1/24 · J2 → FR25 · J3 → FR26–29 · J4 → FR28/17/19 · J5 → FR30 · J6 → FR35/36/39/41/42/46 · J7 → FR21/37/43/44 |
| Implementation leakage | Pass (informational) | Inertia, Stripe, Docker, `composer audit`, Larastan, Pint, WAL and serializable transactions appear. All are logged stack decisions or inherited guarantees of a brownfield rewrite, so they're accepted. NFR-R3 could be phrased as an outcome (m19) |
| Domain compliance (paid service, UK) | Warning (minor) | Money and idempotency are well covered. There's no statement on personal-data handling (UK GDPR) or on PCI scope (m18) |
| Project type (authenticated web app + webhook + CLI) | Pass | Auth, authorisation matrix, webhook, CLI bootstrap, ops and noindex are all present |
| SMART | Pass | Most FRs score 4–5. The lowest are FR35, FR44, FR47, FR49 and FR53 |
| Consistency with brief, DV-, UX and research | Warning | NFR-R5 vs A-11 and research §4.5 (M1). The FR53 units vs X-12 and DV-13 (M4). Small mismatches in the DV list, the backup targets and IA approval (m1, m2, m12, m15) |
| Completeness | Warning | Gaps listed as M2, M5 and M6 plus the minors |

**Holistic quality: 4/5 (Good).** It reads well for both people and LLMs, and the "if it isn't an FR it won't be built" rule makes the gaps below matter.

## 2. Findings

Severity: **critical** = blocks architecture or would cause a wrong build · **major** = must be fixed before architecture is finalised · **minor** = fix when convenient.

| # | Sev | Location | Issue | Suggested fix text |
|---|---|---|---|---|
| M1 | major | NFR-R5 | It isn't scoped: "Email delivery failures are retried automatically, without blocking or undoing the user's action". That contradicts A-11 and research §4.5 / §7 ("auth link emails must stay synchronous after commit… on failure delete the proof and return the fixed error"). A developer could queue the magic-link, reset and setup emails, which leaves live links that were never delivered | "**NFR-R5:** Lifecycle emails (N-04…N-12) are sent by queued jobs dispatched after commit, retried automatically, and never block or undo the user's action [DV-8]. Auth link emails (N-01…N-03, magic link, reset, setup, checkout continue/resend) are sent synchronously after the credential transaction commits. If sending fails, the link is invalidated and the user gets the fixed error, with no link or provider detail [A-11]." |
| M2 | major | §6/§7 (missing) | Nothing requires the `/api/*` JSON contracts (paths, methods, request and response shapes, status codes) to stay byte-compatible. The brief's Solution, brownfield architecture note 1, research §4.1 and DECISIONS 2026-11-18 ("same /api contracts kept so one parity suite runs against both apps") all depend on it, as does success criterion "parity suite green on both apps". NFR-M3 covers only the error shape | Add "**NFR-M4:** Every `/api/*` endpoint keeps the Next.js contract: path, method, request fields, response keys and types, and status and error codes, except where a DV- row says otherwise (DV-11, DV-12 additive `imageKey`). Verified by the L4 contract suite passing against both apps. [X-03, C-02, brownfield index note 1]" |
| M3 | major | FR12, FR17 | DV-5 isn't expressed. Stripe success and cancel URLs must come from the canonical `PUBLIC_SITE_URL` and the marketing URL, never from forwarded headers. It's a decided security deviation with an `@deviation` test. Today it's mentioned only in K-01's status column | Append to FR12: "Checkout success and cancel addresses are built only from the configured canonical portal and marketing URLs, never from request headers. [DV-5]". Add `DV-5` to FR17's citation |
| M4 | major | FR53 | Mixed and ambiguous units. X-12 says 10 **MiB** and 500 **MiB**, DV-13 says 95 MB = **95,000,000 bytes**, and FR53 writes "MB" for all three. The FR restates limits it otherwise delegates, and a developer could implement 10,000,000 bytes for images. Boundary tests in the golden corpus would then fail | "…images ≤ 10 MiB (10,485,760 bytes) and ≤ 40 megapixels; ZIP archives ≤ 95,000,000 bytes (DV-13), ≤ 1,000 entries, ≤ 500 MiB uncompressed, compression ratio ≤ 100, valid CRCs… [X-12, DV-13]". Or remove the numbers and say "within the X-12 / DV-13 limits" |
| M5 | major | FR46 / FR27 | The admin can't reply in a **concept's feedback thread**. D-17 says "reply in the right thread", the admin messages page loads concepts "for thread choice" (ui-pages), and the comment endpoints are admin-or-member (api-client). FR27 names only the customer, and FR46 names only the project thread. As written, the designer can't answer feedback on a concept | "**FR46:** An admin can message the customer in the project thread, or reply in a specific concept's feedback thread, and can see which thread a customer's message or comment is in. [D-17, C-10]" |
| M6 | major | §6.3 / §6.4 (missing) | No FR says that screens refresh by themselves. UX §1 makes polling a fixed constraint (customer overview 10 s, admin workspace 2 s, audit 2.5 s), ui-pages adds checkout success at 2 s, then 10 s after 45 s, and UX §12 adds the quiet "Reconnecting…" after 3 failures. Polling is implied only through C-02's "polled" (cited by FR23, not FR24/36/45), so the turn changes in J3, J5 and J6 aren't buildable from the FRs | Add "**FR58:** The project overview, concept views, admin workspace and audit log refresh automatically at the documented intervals, without moving content under the reader or losing typed input. After repeated failures they show a non-blocking reconnecting notice. [C-02, C-03, D-02, D-16, K-02, K-10, ux §12, brownfield ui-pages §2]" |
| M7 | major | §7 NFRs | 10 of 22 NFRs don't state how they're measured, or use undefined terms. S1, S3, S4, R2, R3, R5 and A4 have no named test. P1 "tens of concurrent customers" has no number and no tool. P2 "mid-range phone over 4G" is undefined. M1 "the agreed level" is now decided (Larastan 9, DECISIONS 2026-11-18) | Append a method to each NFR, e.g. S1 "(L4 security contract tests plus a route architecture test)"; S3 "(log and response scanning in L4/L6 plus a secret-scan step in CI)"; S4 "(an L3 test across two workers and a restart; failed logins still counted inside a rolled-back fence)"; R2/R3 "(L3 race suite)"; R5 "(a job-failure injection test)"; P1 "at 50 concurrent virtual users for 10 min, measured with k6 against staging"; P2 "Lighthouse mobile profile (Moto G Power, slow 4G), median of 5 runs"; A4 "(L7 baselines in both themes plus a no-flash load test)"; M1 "Larastan level 9" |
| m1 | minor | §1 Executive summary | "DV-1…DV-12" is wrong: DV-3 is out of scope, DV-10 doesn't exist and DV-13 now exists | "a small set of decided fixes (DV-1, DV-2, DV-4…DV-9, DV-11…DV-13; DV-3 is deferred)" |
| m2 | minor | product-brief.md In scope (cross-doc) | The brief lists "DV-1, DV-2, DV-4…DV-9, DV-11" and omits DV-12 and DV-13, which the PRD builds | Update the brief's in-scope line to "…DV-11, DV-12, DV-13" (a brief edit, not a PRD one) |
| m3 | minor | FR47 / FR48 | The public `GET /api/health` → `{ok:true}` (D-18) isn't expressed. Also, inventory D-18 lists "DB, R2, config" while the code also checks Stripe `accounts.retrieve` (api-admin). The PRD is right, so the inventory row is stale | FR47: add "…and anyone can query a minimal public liveness check that reveals nothing but `ok`. [D-18]". Fix D-18 to include the Stripe check |
| m4 | minor | FR49 | "concept feedback" could be read as covering comments. Comments send **no** email, audit or system message (api-client), and N-12 fires only on revision requests. "Sent once per event" overstates the exactly-once-ish marker and ignores F-12 (a finals re-upload in FINAL_FILES_READY re-sends N-09) | "…emails the admin about new projects, client messages, revision requests and approvals (concept comments send no email). Each email is guarded by its `email_sent:*` marker [X-18], so a retry never re-sends it, except the documented finals-repair re-send (F-12)." |
| m5 | minor | FR4 | "invalidates other outstanding links" is vague. Reset deletes **all** of the user's proofs (setup, reset, magic) and sessions, marks the mailbox verified, and creates no session, so the user signs in afterwards | "Resetting ends all their sessions, invalidates every outstanding setup, reset and sign-in link, and doesn't sign them in. They sign in with the new password. [A-08]" |
| m6 | minor | FR44 | "clears its work and usage" is too vague to test | "…returns the project to brief-submitted (or awaiting-brief if there's no brief); deletes concepts, revision requests, comments and file records, and optionally the non-system messages; zeroes usage while keeping limits; keeps the brief, orders, audit and every stored file; requires typing the project name to confirm. [D-15, ux J7]" |
| m7 | minor | FR37 | It's unclear whether resume needs a reason. D-03 requires a 1–500-character reason for every status change | "…put a project on hold, cancel it or resume it, each with a mandatory reason…" |
| m8 | minor | FR23 | Two UX §5.3 rules are missing: `/dashboard` keeps working and redirects, and admins who open customer URLs go to the admin workspace for that project | Append: "The old dashboard address keeps working. An admin who opens a customer address is sent to the admin view of the same project. [ux §5.3, A-16]" |
| m9 | minor | FR33 | Theme choice is C/A in C-19, but the FR names only customers | Add "An admin can also choose the theme." or move theme to a cross-cutting FR |
| m10 | minor | FR35, NFR-A3 | The queue misses the unread-message badges (D-01), search and filter (UX §14), and opening the project on the section that needs action (UX §7). NFR-A3 leaves out the brief's admin target "any needs-action item in 1 click" and "without errors" on the 60 s upload | FR35: "…with the reason each item needs attention and unread-message badges, searchable and filterable. Opening an item lands on the section that needs action." NFR-A3: add "admin reaches any needs-action item in 1 click; concept upload < 60 s without errors" |
| m11 | minor | FR45 | UX §14 has an audit filter by type, which isn't expressed. The list size (latest 100) is delegated | "An admin can view and filter by type a project's audit log…" |
| m12 | minor | NFR-R4 | The backup targets are now decided (plan §3, 2026-11-18: 30 days of PITR plus 12 monthly backups, two repos, a quarterly drill), but "RPO ≤ 15 min to confirm in architecture" is still soft | "Encrypted off-box backups to two repositories with continuous WAL archiving (RPO ≤ 15 min) and 30 days of point-in-time recovery plus 12 monthly backups. A timed restore drill from each repository before launch and quarterly (RTO ≤ 2 h)." |
| m13 | minor | §7 (missing) | Brief in-scope "queue worker, monitoring basics" and the decided email alerts have no NFR | Add "**NFR-O1:** The queue worker and scheduler are supervised and restarted on deploy. Backup failures, failed jobs and stale backups email the owner within 1 h. Verified in the deploy runbook drill. [O-08, plan §3]" |
| m14 | minor | FR56 | "[release gates]" isn't a resolvable reference | Cite `00-migration-plan.md` (gates section) and the research §6.4 restore drill |
| m15 | minor | FR23, §8 | UX §15 item 3 still lists owner approval of the **one-project shortcut** as open. DECISIONS 2026-11-18 records the Files tab and the turn model but not the shortcut. The PRD assumes it | Either log the decision, or add to §8: "One-project shortcut (ux §5.3.1) is pending owner approval." |
| m16 | minor | FR20 / FR30 | The Files tab (UX §5.1, decided) isn't explicit: a project's final files and that project's invoices together, with invoices also listed across projects under Account | Add to FR30: "Final files and the project's invoices and receipts are together in the project's Files section. All invoices are also listed under Account. [ux §5.1]" |
| m17 | minor | Inventory rows the PRD inherits | A-09 says change password "rotates the current one", but the code deletes **all** sessions including the current one (`signedOut:true`, auth-and-security §4). FR5 follows the code, correctly. C-07 says "admin notification" on brief submit, but N-13 and api-client say **no email is sent** | Fix A-09 and C-07 in the inventory. Add to FR25: "No email is sent on submission. [N-13]" |
| m18 | minor | §4 Domain | There's no statement on personal data (names, emails, briefs and messages under UK GDPR, retention), and none on PCI scope | Add to §4: "Card data never touches the portal (Stripe-hosted Checkout, SAQ A scope). Personal-data handling is unchanged from the Next.js app; a retention policy is a post-launch story (brief, Future vision)." |
| m19 | minor | NFR-R3, FR54 | NFR-R3 prescribes a mechanism ("optimistic versioning and serializable transactions") rather than an outcome. That's acceptable as an inherited guarantee, but it's worth splitting. FR54 has no actor | NFR-R3: "Concurrent lifecycle mutations never corrupt state; the loser gets the defined 409 (mechanism: version guard plus serializable transactions, X-17)." FR54: "The system never re-downloads…" |
| m20 | minor | NFR-S4 | The core reason for the research change is missing: failed attempts must still count when the surrounding auth operation rolls back (research §5.4, DECISIONS 2026-11-18) | Append "…and a failed attempt is counted even if the operation it belongs to fails or rolls back." |
| m21 | minor | FR14 | "longer than expected" has no threshold | "…after 45 seconds… [K-02, ux J1]" |
| m22 | minor | FR45 | "credential change" audit is clear, but "email marker" could be read as auditing every email, including auth emails (which have no markers) | "…every lifecycle email marker (X-18)…" |
| m23 | minor | §5 Scope | Brief out-of-scope "campaign landing pages in the portal" isn't listed | Add it to the Out list |

## 3. Exact edits recommended (in priority order)

1. **NFR-R5**: replace it with the two-mode wording in M1.
2. **Add NFR-M4** (the API contract compatibility in M2).
3. **FR12**: append the DV-5 sentence. **FR17**: add `DV-5` to its citation (M3).
4. **FR53**: replace the limits with exact byte and MiB values, citing `[X-12, DV-13]` (M4).
5. **FR46**: replace it with the concept-thread wording in M5.
6. **Add FR58** (automatic refresh, M6).
7. **§7**: append a measurement method to S1, S3, S4, R2, R3, R5, P1, P2 and A4, and set M1 to "Larastan level 9" (M7).
8. **§1**: change "DV-1…DV-12" to "DV-1, DV-2, DV-4…DV-9, DV-11…DV-13 (DV-3 deferred)" (m1).
9. **FR4, FR25, FR37, FR44, FR49**: apply the clarifications in m5, m17, m7, m6 and m4.
10. **FR23, FR30, FR33, FR35, FR45, FR47**: add the UX and inventory details in m8, m16, m9, m10, m11 and m3.
11. **NFR-R4**: update to the decided backup targets (m12). **Add NFR-O1** (m13). **NFR-S4**: add the rollback-counting clause (m20). **NFR-A3**: add the admin targets (m10).
12. **§8**: add the one-project shortcut approval if it isn't logged (m15). **§4**: add the PCI and privacy sentence (m18). **§5**: add campaign landing pages to Out (m23).
13. **Outside the PRD**: fix inventory rows A-09, C-07 and D-18 (m3, m17), and the brief's in-scope DV list (m2).

After these edits, re-run the coverage check (inventory ↔ FR) and confirm that FR58 and NFR-M4 are tagged to parity tests before the architecture is finalised.
