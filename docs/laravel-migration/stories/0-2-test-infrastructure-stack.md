# Story 0.2: Test infrastructure stack

Status: done

## Story

As the team,
I want `docker-compose.test.yml` with postgres 18 (an init script creating `lf_parity` and the marker table), Mailpit, SeaweedFS (bucket bootstrap), **stripe-fake** and **postmark-shim**,
so that both apps test against identical, offline infrastructure.

**Covers:** O-01, O-03, FR55 · **Gate:** n/a (infra) · **After:** 0.1 · **DoD variant:** E0 (spec)

## Acceptance criteria

1. **Given** the stack, **when** the probe PUTs one key twice with `If-None-Match: *`, **then** SeaweedFS returns 412. If not, record the fallback (L3 stub plus an L9 live check) and log a risk.
2. **Given** `POST postmark-shim/email`, **then** the message appears in Mailpit. `POST /__fail` makes the next send return 500.
3. **stripe-fake** implements Checkout Session create, retrieve and line items; customers, invoices and payment intents (with `latest_charge`) retrieve; accounts retrieve. Driven by fixtures in `tests/parity/fixtures/stripe/`, with a fake hosted page that pays or fails a session and posts a correctly **signed** webhook (current timestamp, test secret).
4. Postgres: database `lf_parity`, marker table, runtime and migrate roles (requirement refined by story 0.4, see Dev notes).

## Tasks / subtasks

- [x] `tests/parity/infra/docker-compose.test.yml`: all images pinned (`postgres:18.7`, `axllent/mailpit:v1.33.0`, `chrislusf/seaweedfs:4.51`, `node:24.22.2-alpine3.23`), healthchecks so `up --wait` means ready, loopback-only host ports
- [x] `infra/postgres/init/10-parity.sh`: roles, ownership, `parity.parity_marker`
- [x] `infra/seaweedfs/start.sh`: `weed mini` with a one-identity S3 config and both buckets; ready marker for the healthcheck
- [x] `infra/postmark-shim/server.mjs` (no deps)
- [x] `infra/stripe-fake/server.mjs` + `hosted-page.mjs` (no deps); fixtures `fixtures/stripe/prices.json`, `package-{essential,professional,complete}-paid.json`
- [x] Probes: `infra/probe-s3-conditional.mjs`, `infra/probe-mail.mjs`, `infra/stripe-fake.selftest.mjs`, runner `infra/probe.mjs`; helpers `infra/lib/sigv4.mjs`, `infra/lib/env.mjs`
- [x] `package.json`: `infra:up`, `infra:down`, `infra:probe`; devDependency `stripe` **20.4.0** (exact, = `apps/web/node_modules/stripe/package.json`)
- [x] README section; run the probes from a cold stack; `npm run check`

## Dev notes

- **Ports** (host, `127.0.0.1` only, overridable with `PARITY_*_PORT`): postgres 55432, SMTP 51025, Mailpit API 58025, S3 58333, postmark-shim 58090, stripe-fake 58091. Chosen to avoid the other local stacks on this machine (5432, 543xx).
- **DB (refined by the coordinator for story 0.4):** the marker is `parity.parity_marker` in its own schema, because `prisma migrate deploy` refuses a non-empty `public` (P3005). `lf_migrate` (LOGIN) owns the database, `public` and `parity`. `lf_runtime` (LOGIN) gets only `CONNECT`, `USAGE` on `parity` and `SELECT` on the marker; table grants come from `apps/web/ops/postgres/runtime-grants.sql` after migrations (`10-parity.sh:15-37`). Test-only passwords: superuser `postgres` / `parity-test-only-superuser`, `lf_migrate` / `parity-test-only-migrate`, `lf_runtime` / `parity-test-only-runtime` (`docker-compose.test.yml:18-23`). The data dir is tmpfs, so `down` and `up` give a fresh DB.
- **S3:** SeaweedFS needs signed requests (unsigned PUT → 403), path-style. Test-only keys `parity-test-only-access-key` / `parity-test-only-secret-key`. Bucket names come from `PARITY_S3_CONCEPTS_BUCKET` / `PARITY_S3_FINALS_BUCKET` (defaults `lf-parity-concepts`, `lf-parity-final-deliverables`). Not `R2_*`, so a real bucket name exported in the shell can't leak in.
- **postmark-shim** (`postmark-shim/server.mjs:41`): needs a non-empty `X-Postmark-Server-Token` (401 otherwise; it must match `POSTMARK_SHIM_TOKEN` if set). Validates From/To/body like Postmark (422 `ErrorCode 300`). Forwards to Mailpit `POST /api/v1/send` with `MessageStream` as the `X-PM-Message-Stream` header. Returns `{To, SubmittedAt, MessageID, ErrorCode:0, Message:"OK"}`. `/__fail {"count":N,"status"?}` queues N failures (`:89`); `/__reset`, `/__sent`.
- **stripe-fake** (`stripe-fake/server.mjs`): Bearer `sk_test_*`/`rk_test_*` only (401 otherwise). Form/query decoding with Stripe bracket notation (`:242`). Routes (`:275`): sessions create/retrieve/line_items, customers, invoices, payment_intents, charges, `/v1/account`, `/v1/accounts/:id`. Generic `expand` by ID prefix, including nested `payment_intent.latest_charge` and `line_items` (`:181`). Unknown objects → 404 `resource_missing`, unknown price → 400 `resource_missing`. `Idempotency-Key` replay. Shapes follow what `checkout-fulfillment.ts`, `client-invoices.ts` and the webhook read: `payment_status`, `customer_details`, `custom_fields[].text.value`, `customer`, `payment_intent`, `invoice`, `amount_total`, `currency`, `metadata`, `latest_charge.receipt_url`, `invoice_pdf`/`hosted_invoice_url`/`status_transitions.paid_at`/`amount_remaining`.
- **Hosted page** (`:328`): `GET /pay/:id` has a form with Pay/Fail. **Pay** creates a customer (if `customer_creation=always`), a payment intent, a charge with `receipt_url`, and an invoice when `invoice_creation.enabled`. It marks the session `complete/paid`, sends `checkout.session.completed`, then 303s to `success_url` with `{CHECKOUT_SESSION_ID}` filled in. **Fail** marks it `complete/unpaid` and sends `checkout.session.completed` (unpaid) **then** `checkout.session.async_payment_failed`, as Stripe does for delayed methods. A delivery failure doesn't block the redirect; it's recorded in `/__deliveries` (no automatic retry; resend with `/__webhook`).
- **Signing** (`:206`): `Stripe-Signature: t=<now>,v1=HMAC-SHA256(secret, "t.payload")`, secret `whsec_parity_test_only_0000000000000000` (test-only; apps must set `STRIPE_WEBHOOK_SECRET` to it in parity mode).
- **Admin** (`:358`): `POST /__fixtures/load {names|name|fixture, reset?}`, `POST /__webhook/:sessionId {type?, markPaid?, target?, badSignature?}` (`markPaid` settles an unpaid session, e.g. for `async_payment_succeeded`), `POST /__config {webhookUrl}`, `POST /__reset`, `GET /__deliveries`, `GET /__state`.
- **Webhook target from Docker:** `host.docker.internal` via `extra_hosts: host-gateway`. Verified working on Docker Desktop + WSL2 (the selftest's receiver on the WSL host got every event).

## Conversion record

### Inventory scope
O-01, O-03 (infrastructure part), FR55. Prepares K-01…K-06, K-11, A-11, X-10.

### Next.js source read
`apps/web/src/app/checkout/start/route.ts`, `app/api/projects/[id]/checkout/session/route.ts:87,116`, `app/api/admin/checkout/reprocess/route.ts:27`, `app/api/admin/health/route.ts:134-135` (`accounts.retrieve()`), `app/api/stripe/webhook/route.ts:47,145`, `lib/checkout-fulfillment.ts:103-170` (custom fields, line items, customer lookup), `lib/client-invoices.ts:72-160` (expand and invoice fields), `lib/stripe.ts`, `lib/stripe-price-allowlist.ts`, `lib/auth/mail.ts:41-56` and `lib/project-lifecycle-email.ts:117-132` (Postmark payload), `lib/storage/r2.ts:52-55,109-117` (IfNoneMatch, ContentMD5, bucket env), `brownfield/checkout-and-payments.md`.

### Behaviour notes
- Next calls exactly: `checkout.sessions.create|retrieve(expand customer | invoice + payment_intent.latest_charge)|listLineItems(limit 10)`, `customers.retrieve`, `invoices.retrieve`, `paymentIntents.retrieve(expand latest_charge)`, `accounts.retrieve()`, `webhooks.constructEvent`.
- Upsell sessions have no `invoice_creation`, so the fake reports `invoice_creation.enabled=false` and creates no invoice.

### Laravel implementation
None (E0).

### Deviations from Next.js
None. The fake has no `charge.invoice` field (removed in recent API versions); Next reads it optionally.

### Tests
| Layer | Test | IDs |
|---|---|---|
| infra | `tests/parity/infra/probe-s3-conditional.mjs` (9 checks) | X-10 prerequisite |
| infra | `tests/parity/infra/probe-mail.mjs` (5 checks) | A-11 prerequisite |
| infra | `tests/parity/infra/stripe-fake.selftest.mjs` (15 checks, real `stripe@20.4.0`) | K-01…K-06, K-11 prerequisite |
| infra | `tests/parity/infra/probe.mjs` (DB bootstrap, 3 checks + the three above) | O-01, O-03 |

### Test evidence (2026-11-19)
- `npm run infra:down && npm run infra:up`: all 5 containers healthy (cold start).
- `npm run infra:probe`: **postgres OK, s3 OK, mail OK, stripe OK**. Postgres 3/3, S3 9/9, mail 5/5, stripe-fake 15/15.
- **S3 probe result:** SeaweedFS 4.51 **returns 412** on the second `If-None-Match: *` PUT, and the first body survives. 8 concurrent create-only PUTs → exactly one 200 and seven 412. HEAD, a presigned GET with a UTF-8 `response-content-disposition` (echoed verbatim), a bad presign signature → 403, a `Content-MD5` mismatch → 400 `BadDigest`, and an unsigned PUT → 403 all behave like R2. **No fallback needed**; the L3-stub fallback stays documented only.
- stripe-fake selftest: the SDK creates (package and upsell params), retrieves, lists line items, expands, gets typed errors (`StripeInvalidRequestError` 404/400, `StripeAuthenticationError`), and `constructEvent` verifies every fake webhook and rejects a `badSignature` one.
- `npm run check`: OK. `npm run selftest`: 3/3 PASS.
- Not run: either app against the stack (seams are story 0.3; Next run-through comes with 0.4/0.5).

### Gotchas
- `weed mini` pre-creates buckets with `-bucket=a,b`, but the S3 port opens before the buckets exist. `start.sh` polls `weed shell s3.bucket.list` and writes a ready marker for the healthcheck.
- The marker table can't live in `public` (P3005, see Dev notes).
- `x-test-only` YAML anchors keep every throwaway credential in one block of the compose file.

### Docs updated
`tests/parity/README.md` (infra section). Parent to update: inventory, test strategy, sprint-status, handoff (see report).

### Open items
- Test strategy §3/§7 still say MinIO and a separate `stripe/sign.mjs`. Both are now SeaweedFS and the stripe-fake signer (for the parent to edit).
- `docker-compose.test.yml` will later gain the Laravel app and queue worker (architecture §131).


## Parent review (2026-11-19)
Cherry-picked as `7079975` (README conflict merged with the Next-on-stack recipe). `infra:probe` re-run on main: all OK.
