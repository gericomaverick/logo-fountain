# Story 6.11: Files tab and final download

**Status:** review, **API half only** (Files-tab UI pending the owner's key-screen approval) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-13 (API), K-11 (already built in 5.7), C-18 (UI pending) · **Gate:** `@finals&@api`, `@finals&@ui`, `@invoices&@ui` · **After:** 6.2b, 3.1, 5.7. Test mode only; storage is a mock S3 client, no Stripe call.

## Story
As a signed-in client, I can download my project's final ZIP, and the first download marks the project delivered.

## Acceptance criteria
1. `POST /api/projects/{id}/finals`: member only. One serializable transaction checks membership, status `FINAL_FILES_READY` or `DELIVERED`, an approved concept and a `final_zip`; returns `{url}`, a presigned GET (3600 s) of the newest final asset (created_at, id) with disposition `{brand}-{YYYY-MM-DD, UTC of the asset}.zip`. (API, done)
2. The first download moves `FINAL_FILES_READY` to `DELIVERED` through the version guard (audit `state_changed`, reason `client_final_zip_download`). A `DELIVERED` project is served with no write and no audit. (API, done)
3. Every miss is the same 404 `FINAL_ZIP_NOT_AVAILABLE` (non-member, admin, unknown or non-uuid project, no approval, no ZIP, other status); anonymous 401; cross-origin 403 before any lookup. (API, done)
4. A lost guard or a serialization or lock failure is 409 `FINAL_DOWNLOAD_CONFLICT`, nothing is written and no URL is returned. (API, done)
5. Invoices list for a project and for the account: already built (story 5.7, `InvoiceController`, `InvoicesApiTest`); nothing added here. (done)
6. Files tab with the project's invoices and receipts; `/settings/invoices` (C-18). **Pending: UI waits for the owner's key-screen approval.**

## Inventory scope
C-13 (API half). K-11 covered by 5.7. C-18 deferred to the UI half of this story / 6.12.

## Next.js source read
`apps/web/src/app/api/projects/[id]/finals/route.ts` and `route.test.ts`; `lib/final-deliverable-filename.ts` (already ported as `App\Support\FinalDeliverableFilename`); parity specs `client-approval-finals.spec.ts`, `client-authz.spec.ts:124`.

## Behaviour notes
Order in Next: Origin guard, sign-in, transaction. Inside it a `findFirst` with membership, status in (FINAL_FILES_READY, DELIVERED), approved concept and final_zip, then an `updateMany` guarded on status, membership, approval and the exact asset id and path; `count != 1` is the conflict. FINAL_FILES_READY also audits `state_changed`. Brand: company name, else owner (role `owner`, else first membership) name (first+last, else full name), else email local part, else `logo-fountain`. Signing happens inside the transaction. Prisma `P2034`/`P2028` map to the same 409. Constants: 3600 s, maxWait 2000 ms, timeout 5000 ms.

## Laravel implementation
`Actions/Finals/DownloadFinal` (`Db::serializable`: the project row is read `FOR UPDATE` under the same membership, status, approval and asset predicates, then `Db::guardedProjectUpdate`), `Http/Controllers/Api/FinalDownloadController`, route in `routes/checkout.php`, two `ErrorCodes`. Signing uses the container's `PrivateStorage` (`final-deliverables` namespace) and the existing `FinalDeliverableFilename`.

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| DELIVERED re-download | same-value write to take a row lock | `SELECT … FOR UPDATE`, no write (so `updated_at` and `version` stay) | same serialization, no needless write | none (owner may note) |
| Non-uuid project id | Prisma error (500 path) | 404 `FINAL_ZIP_NOT_AVAILABLE` | same as every other id route | none |
| Concurrent change | Prisma `P2034`/`P2028` | `Db::serializable` retry then 409; lock/statement timeout 409 | ADR-011 | ADR-011 |

## Tests
| Layer | Test | IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/FinalsApiTest.php` (7 cases: newest asset, disposition, expiry, DELIVERED, audit, idempotence; brand fallbacks; 401/404 guards incl. admin, other tenant, non-uuid; no approval/ZIP/status; cross-origin 403; 409 with rollback) | C-13 |
| L4 | `client-approval-finals.spec.ts` (6), `client-authz.spec.ts:124` (1) | C-13 |

Compared with Next `route.test.ts` (6 cases): origin first, guard predicates, no sign without a row, 409 on a lost guard with no audit and no URL, P2034/P2028 to 409, transition and audit once, DELIVERED keeps status and no second audit. All have a Pest counterpart except the two Prisma error codes: the Laravel equivalent is `Db::serializable` (covered by `SerializableTest`); only the lost-guard 409 is exercised here, by bumping `version` inside the transaction.

## Test evidence
- `bin/test` (check-agents-guide, Pint, Larastan 9, Pest incl. Concurrency): 2206 passed, 1 warning (pre-existing `SafeNextTest`), 0 failed; Pint failed once on my new files, fixed, then passed.
- `npm run typecheck`: exit 0. `npm run lint`: exit 0.
- Parity `laravel-stack.mjs "@finals&@api"`: 7 passed (all C-13 cases), 14 failed, all admin routes (D-11, D-12, D-13, D-15, DV-11, DV-13), not in this story.
**Not run:** `@finals&@ui`, `@invoices&@ui` (no UI); L3 race (`pg-race`) for finals: the lost-guard path is simulated in L2, no two-process test; parity against Next; real R2/SeaweedFS signing fetch (URL structure only checked).

## Gotchas
Parity admin rows with `@finals` in the gate make it exit 1; the gate for this story is the C-13 cases only.

## Docs updated
Inventory C-13 row, sprint-status (review).

## Open items
Files-tab UI, invoices page (C-18), `@finals&@ui` and `@invoices&@ui` after the key-screen approval. Admin finals (D-11..D-13) belong to the admin epic.
