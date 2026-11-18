# Brownfield documentation of `apps/web`: index

The Phase 0 output of BMAD `document-project` (deep scan, apps/web only), 2026-11-18. **Every statement here was read from source.** Where code and earlier docs or decisions disagree, the code is described and the gap is listed as a finding below.

| Doc | Covers |
|---|---|
| [auth-and-security.md](auth-and-security.md) | Identity, sessions, the mailbox-proof links, the credential fence, every `/api/auth/*` endpoint, the Origin guard, safe-next, trusted IP, rate limits, password policy, the checkout auth emails |
| [checkout-and-payments.md](checkout-and-payments.md) | Price catalogue, checkout start, the Stripe webhook lease and claim, fulfilment and provisioning, upsells, checkout status, admin reprocess, invoices |
| [api-client.md](api-client.md) | Every client-facing `/api/projects/*` endpoint plus profile |
| [api-admin.md](api-admin.md) | Every `/api/admin/*` endpoint: concept upload, replace and revision, publish, delete, revision delivery, finals, entitlements, status, reset, audit, health |
| [storage-and-uploads.md](storage-and-uploads.md) | The private R2 client, immutable writes, presigning, the byte-level image and ZIP validators, the golden fixture corpus plan |
| [business-rules-and-notifications.md](business-rules-and-notifications.md) | Where each `lib` module goes (PHP or TS), the state machine, the snapshot contract, entitlements, system messages, lifecycle emails, the brief, admin grouping, DB roles |
| [ui-pages.md](ui-pages.md) | Every page: server vs client, guards, polling intervals, browser storage, components, screens needing L7 baselines (ui-pages §5) |
| [data-model-and-ops.md](data-model-and-ops.md) | Tables → Laravel tables, roles and grants, admin bootstrap, env vars, dev scripts, the existing tests |
| [../test-port-ledger.md](../test-port-ledger.md) | All 110 test files → inventory IDs → their destination after the port |

## Findings (ruled on 2026-11-18)

**Outcomes:** the owner decided F-1 (enable), F-2 (fix), F-3 (defer), F-6 (fix), F-7 (make impossible) and F-9 (email the client). F-4, F-5, F-8 and F-11 follow the recommendation below. F-10, F-12, F-13 and F-14 keep parity (an assumption logged for review). The resulting Laravel targets are the **DV-** rows in `01-feature-inventory.md` → "Decided deviations".

| # | Area | Finding | Recommendation |
|---|---|---|---|
| F-1 | Checkout | Promotion codes (`PRO40FIRST5`, decided 2026-03-01) can't be entered: no `allow_promotion_codes` | Enable in Laravel (one parameter), if the promotion is still wanted |
| F-2 | Upsell | An upgrade **sets** the revision limit to the target tier, wiping a previously bought extra revision. The decision on record says additive | Laravel: `new limit = current limit + (target tier − current tier)`, so paid add-ons survive |
| F-3 | Billing | VAT number capture and display was decided (2026-03-02) but never built | Leave out of migration scope (a post-launch story) |
| F-4 | Checkout | `campaign_slug` never reaches `ProjectOrder.campaignSlug` for package purchases | Fix in Laravel (copy from metadata) |
| F-5 | Checkout | Stripe success and cancel URLs are built from `X-Forwarded-*`/`Host` headers, not the canonical `PUBLIC_SITE_URL` | Use the canonical origin in Laravel |
| F-6 | Admin | "Reprocess stuck purchase" fulfils and provisions but sends no setup or sign-in email and no admin email | Reprocess runs the same post-fulfilment steps as the webhook |
| F-7 | Security | Clients can fetch asset URLs for, comment on, and request revisions against **unpublished** concepts if they know the UUID | Limit the client routes to published and approved concepts |
| F-8 | Email | Lifecycle emails are sent inline after commit. A failure is surfaced or swallowed per route, with no retry | Queued `afterCommit` jobs with retries (same visible behaviour) |
| F-9 | Email | Delivering a revision by **uploading** the revised file sends no "Your revised concept is ready" email (only "mark delivered" does) | Send N-05 on revision upload too |
| F-10 | Admin | `draft` concepts and the publish route are legacy (upload publishes immediately) | Port for parity, with no UI change |
| F-11 | API | The finals upload returns `{error:"…", code}` (string) in three places, unlike the standard `{error:{message,code}}` | Normalise in Laravel, updating the admin UI in the same story |
| F-12 | Email | Re-uploading finals while `FINAL_FILES_READY` re-sends the "final files ready" email | Keep and document it |
| F-13 | Lifecycle | `IN_DESIGN` is unreachable: no route sets it | Keep parity. Optional later "Mark in design" admin action |
| F-14 | Messages | System messages are deduplicated by body, so legitimate repeats (e.g. after a reset) are suppressed | Keep parity now. A post-launch fix |
| F-15 | Storage / cost | Polled pages (customer hub every 10 s, admin project every **2 s**, concept lists) re-sign concept image URLs on every poll. A new query string means a browser cache miss, so **every poll re-downloads every image from R2**: Class B operations and bandwidth wasted, and visible image flicker. E.g. one admin tab with 3 images open for an hour ≈ 5,400 R2 reads | Laravel: the API also returns a stable `imageKey` (the file asset id). The React image component **keeps its current `src` until `imageKey` changes or the URL is within 5 min of expiry**. Signed URLs are still never stored server-side. Decided under the owner's R2-for-images intent (2026-11-18) |

## Notes for architecture (step 3.1)

1. Keep the `/api/*` JSON contracts **byte-compatible**. The React pages and the parity suite depend on them.
2. **Version column:** lifecycle concurrency relies on `projects.updated_at` as an optimistic version. Recommend an explicit `version` integer plus serializable transactions (map SQLSTATE 40001/40P01 to the existing 409 codes).
3. **Auth** is custom on top of Laravel's session guard (database sessions plus an absolute 7-day cap, the fence, proofs, credential versions, the fragment-token pages). No starter kit routes.
4. **Two DB connections** (runtime and migrate) with the grants script, and `admin:bootstrap` on the migrate connection.
5. **S3 writes** go through the AWS SDK for PHP directly (`IfNoneMatch: *`). Validators are ported byte for byte and proven against a **shared golden corpus**.
6. **Queues:** a database queue plus a supervised worker on Hetzner (new runtime component). Emails go through jobs dispatched after commit.
7. **UI-only TS modules stay TS** with their tests (`business-rules-and-notifications.md` §1). Shared rules get PHP plus TS with a shared JSON fixture.
