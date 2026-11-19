# Story 0.8d: Admin journeys 12–18

Status: review

**Covers:** D-01, D-03, D-05, D-06, D-07, D-11…D-16, D-18, K-12, X-07, X-08, X-13 · **Gate:** `@admin&@ui` · **After:** 0.8a · **DoD:** E0

## Delivered (`tests/parity/`)
- **Scenarios** (`fixtures/scenarios/`, existing keys only, all seed on Next with the unchanged `apps/web/scripts/parity-seed.mjs`):
  - `draft-concept`: p1 CONCEPTS_READY (1 published, 2 draft); p2 BRIEF_SUBMITTED (only a draft).
  - `finals-ready-no-approval`: FINAL_FILES_READY + final ZIP, both concepts published.
  - `stale-hold`: four ON_HOLD projects missing their restore evidence: p1 from FINAL_FILES_READY without a ZIP, p2 from CONCEPTS_READY with only a deleted concept, p3 from REVISIONS_IN_PROGRESS with only a delivered request, p4 from BRIEF_SUBMITTED without a brief. The format can't express `heldVersion` (the seeder never writes it, `parity-seed.mjs:105`), so the stale-version case is produced at runtime (below).
  - `admin-queue` (extra, for J12/J18): q1 pending revision, q2 unread client message, q3 order `NEEDS_CONTACT` (stuck), q4 plain BRIEF_SUBMITTED, q5 AWAITING_APPROVAL, q6 DELIVERED.
- **0.7c fixme cases converted** (no `fixme` left in `@admin&@api`): `admin-concept-actions.spec.ts` D-06 publish draft (+ first visible concept → CONCEPTS_READY); `admin-finals.spec.ts` D-11 `FINAL_REPAIR_REQUIRES_APPROVAL`; `admin-status.spec.ts` D-03 RESUME evidence (stale-hold) and stale `heldVersion` (hold, then an upgrade webhook writes the project, then RESUME → 409); `admin-ops.spec.ts` K-12 reprocess success, dedupe, `CHECKOUT_SESSION_NOT_PAID`.
- **Page objects:** `pages/admin.ts` (interfaces + `adminPagesFor`), `pages/next/admin.ts`, `pages/laravel/admin.ts` (stubs naming Epic 7 stories), one export appended to `pages/index.ts`. The interface follows the redesigned IA (Queue with reasons, workspace sections, Actions, Payment/Reprocess, Health; `ux-design.md` §5.2, J6/J7). Outcomes are `{done}`/`{done:false,message}` so "refused" and "not offered" both count as rejection.
- **Journeys** `journeys/j12…j18-*.spec.ts` (`@admin @ui` + domain, all `db: "exclusive"`): J12 queue order and reasons, reading a thread clears "unread"; J13 hold/resume/cancel, refusals, audit, resume without evidence; J14 lost-response upload replayed once, delete, last-visible guard; J15 DELIVERED finals replace, newest served, old signed link still works, notify retry after a postmark-shim failure; J16 override with reason, clean-slate reset, objects kept (pre-reset links download), audit; J17 health with the SeaweedFS container stopped then restarted (found by its published S3 port); J18 reprocess a paid stripe-fake session that had no webhook (no email assertions: DV-6 is 0.8e).

## Evidence (2026-11-19, stack `-p lf08d`, Next 16.4 `next dev --webpack` on 127.0.0.1:4400, after merging main with 0.8b)
| Run | Result |
|---|---|
| `@admin&@ui` `--repeat-each=2` | 16/16 (8 tests) |
| `@admin&@api` | 61/61, 0 skipped |
- `npm run check`: OK (41 specs, 236 titles). `tsc --strict` (bundler resolution) clean for every touched file.
- One flake found and fixed: the overview's poll clears the error alert, so the page object now watches the alert from the click (`pages/next/admin.ts` `act`).

## Next behaviour worth knowing (paths under `apps/web/src/app/`)
1. **No Hold or Cancel control** on the admin overview, only "Resume recorded phase" while ON_HOLD (`admin/projects/[id]/page.tsx:365-373`). `brownfield/ui-pages.md` says the page has hold/cancel. **No delete or publish control** anywhere in the admin UI (`admin/projects/[id]/concepts/page.tsx`). The Next page object sends those requests from the signed-in browser session.
2. The admin's **own** messages count as unread for the admin: the queue takes the latest non-system message of any sender (`admin/page.tsx:300,331`) until the admin opens Messages.
3. The overview's 2 s poll runs `setError(null)` (`admin/projects/[id]/page.tsx:174`), so refusals are visible for at most about 2 s.
4. A lost upload response leaves the concepts page stuck on "Uploading…" (no try/catch, `concepts/page.tsx:113-130`). Reload plus retry replays the receipt, because the key stays in sessionStorage (`lib/concept-upload-key.ts:12`).
5. Reprocess is only reachable from a stuck project's overview. Its input has a placeholder but no label, and success shows nothing beyond a refresh (`admin/projects/[id]/page.tsx:182-189,510-521`).
6. Without an approved concept, FINAL_FILES_READY is shown as `AWAITING_APPROVAL` with `finalZip.assetId:null` in the snapshot, while the admin list still says FINAL_FILES_READY (`admin-finals.spec.ts` D-11 repair).
7. An upgrade webhook writes `Project.packageCode` even while ON_HOLD (`lib/checkout-fulfillment.ts:278`). That moves `updatedAt` past `heldVersion`, so RESUME is refused (`api/admin/projects/[id]/status/route.ts:47`). Upsell provisioning needs the purchaser to be the client's billing email (`lib/checkout-fulfillment.ts:452`).
8. The concepts upload labels aren't associated with their inputs (`concepts/page.tsx:238-243`). The "Send/retry client notification" button reads "Sending…" while an earlier action is refreshing (`admin/projects/[id]/page.tsx:484`).

## Notes for the Laravel seeder (story 2.6)
- Multi-project scenarios (up to 6) whose clients share one member (`clientA`), with distinct order session and payment-intent IDs. The order status `NEEDS_CONTACT` must mark the project stuck.
- Concepts in `draft` and `deleted` status get a FileAsset and object like any other. Revision requests can be `delivered`. An ON_HOLD project can have **no brief** (stale-hold p4).
- The seeded hold `state_changed` has **no** `heldVersion` (matching Next), so seeded holds resume on evidence alone.
- Queue titles come from the brief's `brandName`.

## Open items
- **Parent:** update the inventory and ledger for the covered rows, and copy Next points 1–3 and 7 into `brownfield/ui-pages.md` / `api-admin.md` (point 1 corrects ui-pages.md §2).
- J17 really stops SeaweedFS for a few seconds. Tests that use `db: "none"` and storage could fail in that window if they run in parallel.
- Laravel admin page objects: Epic 7 (7.1–7.11). STRIPE_FAKE_PUBLIC_URL isn't needed by these journeys (J18 loads the session directly).
