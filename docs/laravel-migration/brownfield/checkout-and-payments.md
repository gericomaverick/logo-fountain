# Brownfield: checkout, Stripe webhook, fulfilment, upsells, invoices (as built)

Phase 0 capture, 2026-11-18, read from source. Covers **K-01…K-14, A-06, N-01, N-02, N-10**. Paths are relative to `apps/web/src/`.
Stripe SDK API version pinned: `2026-02-25.clover` (`lib/stripe.ts`). Laravel must pin the same version in `stripe-php`.

## 1. Price catalogue (`lib/stripe-price-allowlist.ts`)

| Code | Price ID | Display |
|---|---|---|
| `essential` | `price_1ToTEhFM0K9Qd7oXM0WRTWjd` | £349 |
| `professional` | `price_1ToTFQFM0K9Qd7oXmHYwoZAT` | £795 |
| `complete` | `price_1ToTGBFM0K9Qd7oX2D5r9Z6i` | £1,495 |
| add-on `extra_revision` (+1 revision) | `price_1ToTbLFM0K9Qd7oXscIEu2Bt` | £95 |
| upgrade essential → professional | `price_1ToTXjFM0K9Qd7oXqfXEXy0x` | £495 |
| upgrade professional → complete | `price_1ToTYMFM0K9Qd7oXBG8DOhY1` | £750 |

- Package entitlements on purchase (`PACKAGE_ENTITLEMENTS`): essential concepts 1 / revisions 1, professional 2/2, complete 3/3.
- A placeholder check: any price ID that's empty or contains `REPLACE` gets logged at boot (`STRIPE_PLACEHOLDER_PRICE_IDS`). Laravel: keep this in a config file (`config/logo_fountain.php`) and fail a boot-time check in production.
- There's no essential → complete upgrade path. Anything else returns `400 UNSUPPORTED_UPGRADE_PATH`.

## 2. `GET /checkout/start` (public, no Origin guard)

- `package_code` must be `essential|professional|complete`, otherwise `400 INVALID_PACKAGE` "Invalid package_code. Expected one of: essential, professional, complete".
- `campaign_slug`: trimmed, max **80** chars, optional. Goes into `metadata.campaign_slug`. ⚠️ Fulfilment never copies it to `ProjectOrder.campaignSlug` for new purchases; only upsells set that column (§5). See finding F-4.
- Session parameters: `mode=payment`, `customer_creation=always`, `billing_address_collection=auto`, phone collection off, `invoice_creation.enabled=true`, required custom text fields `first_name` and `last_name` (1–80 chars, labels "First name"/"Last name"), `metadata.package_code`.
- `success_url = {requestOrigin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url = {PUBLIC_MARKETING_SITE_URL origin or requestOrigin}/#packages`.
  - ⚠️ `requestOrigin` comes from `getRequestOrigin`, which **trusts `X-Forwarded-Proto/Host`** (finding F-5).
- Success → `303` redirect to Stripe. No URL → `500 CHECKOUT_URL_MISSING`. Stripe error → `500 CHECKOUT_SESSION_FAILED` with `details.nextStep` "Verify Stripe configuration and retry." (the message is Stripe's error message).
- **No `allow_promotion_codes`.** Promotion codes such as `PRO40FIRST5` **can't be entered** today (finding F-1).

## 3. `POST /api/stripe/webhook` (public, signature-authenticated)

1. No `STRIPE_WEBHOOK_SECRET` → `400` plain text. No `stripe-signature` → `400` "Missing stripe-signature header". The raw body is verified, and a bad signature → `400` "Webhook signature verification failed: …".
2. **Non-fulfilment events** (anything except `checkout.session.completed` and `checkout.session.async_payment_succeeded`): upsert `StripeEvent {eventId, type, createdAt=event.created, processedAt=now}` and return `200 {received:true, ignored:true, id, type}`. For `checkout.session.async_payment_failed` it returns `{received:true, paymentFailed:true, id, type}` and logs a warning with the id and type only.
3. **Claim with a lease.** Insert `StripeEvent` with `type = "processing:{epochMs}:{uuid}:{eventType}"`. On a unique violation:
   - existing row with `processedAt` set → `200 {received:true, deduped:true}`;
   - existing claim younger than **5 min** (`PROCESSING_LEASE_MS`) → `409 {received:true, inFlight:true, retry:true}` (Stripe retries);
   - expired or unmarked claim → a conditional `updateMany` reclaims it. Losing that race → 409.
4. `session` = the payload object, or for `async_payment_succeeded` a **fresh** `sessions.retrieve(id)`. A missing ID → "Malformed Stripe event payload…" (permanent).
5. `fulfillCheckoutSession(session)` (§4), then **renew the lease** (a conditional update on our marker; if lost → `WEBHOOK_CLAIM_LOST`).
6. If there's a purchaser email: `ensureAccessProvisioning` (§4.3).
7. **Customer email, once only:** if there's no `AuditEvent {projectId, type:"email_sent:checkout_auth:{sessionId}"}`, renew the lease and send a **setup** link if `needsSetup`, else a **sign-in** link (`next=/project/{projectId}`). If skipped (Postmark not configured) in production, throw (retry). Otherwise write that audit row.
8. **New-project admin email** (only when there's no `metadata.kind`, i.e. not an upsell): renew the lease, then `notifyAdminNewProject(projectId)`. It keeps its own durable sent marker. Skipped in production → throw.
9. Renew the lease, mark `StripeEvent.type = eventType, processedAt = now` (conditional on our marker). Return `200 {received, fulfilled:true, deduped, projectId, id, type, purchaserEmail, orderStatus, provisionedUserId, isReturningCustomer}`.
10. **Error classification** (`lib/webhook-error-classification.ts`):
    - Transient: codes `P1001 P1002 P2024 ETIMEDOUT ECONNRESET ECONNREFUSED`, or a message containing `timeout`, `rate limit`, `temporarily unavailable` or `network`, **or anything unrecognised (the default)**. Delete our claim row, then `500 {received:true, fulfilled:false, error:"Webhook processing failed", classification, retry:true}`.
    - Permanent: `CHECKOUT_SESSION_NOT_PAID`, or a message containing "checkout session is not paid", "malformed stripe event payload", "allowlisted package" or "missing checkout session id". Mark the event processed, then `200 {…retry:false}`.
    - Laravel: map the equivalent PDO/SQLSTATE connection errors (`08xxx`, `57P01`, lock or statement timeouts) to transient. Write unit tests for every row.
- Delivery semantics: **at least once**. Emails can be duplicated in rare crash windows (documented in `apps/web/docs/webhook-delivery-semantics.md`).

## 4. Fulfilment (`lib/checkout-fulfillment.ts`)

### 4.1 Common
- **The paid gate comes first:** `payment_status !== "paid"` → `CheckoutSessionNotPaidError` (code `CHECKOUT_SESSION_NOT_PAID`) before any lookup.
- Purchaser email: `customer_details.email`, then the expanded `customer.email`, then `customers.retrieve(customer)` (skipped if deleted). Lowercased and trimmed.
- Name: the custom fields `first_name`/`last_name`, then `customer_details.name`. Client name falls back to the full name, then the Stripe name, then the email's local part, then "Logo Fountain Client".

### 4.2 New package purchase
- Dedupe: an existing order with the same `stripeCheckoutSessionId` returns `deduped:true` with the existing IDs.
- Package = the **line items** resolved through the price map. They must map to **exactly one** allowlisted package, otherwise a permanent error. Metadata isn't trusted.
- One transaction:
  - `Client {name, slug = slugify(name, max 48) || "logo-fountain-client" + "-" + last 8 chars of the session ID lowercased, billingEmail}`. **Every purchase creates a new Client**, even for a returning customer.
  - `Project {status: AWAITING_BRIEF, packageCode}`.
  - Entitlements per the package (consumed 0, reserved 0).
  - `ProjectOrder {status: FULFILLED if an email exists else NEEDS_CONTACT, currency (default gbp), totalCents = amount_total, session ID, payment-intent ID}`.
  - Audit `order_fulfilled {orderId, orderStatus, checkoutSessionId}` and `state_changed {previousStatus:null, nextStatus:"AWAITING_BRIEF"}`.
- ⚠️ No `MessageThread` is created here. Check where threads are lazily created (messages route).

### 4.3 Access provisioning (`ensureAccessProvisioning`)
In a transaction with `pg_advisory_xact_lock(hashtextextended('provision:' || email, 0))`:
- Requires: the client exists, `client.billingEmail` normalised equals the email, and the client has a `FULFILLED` order. Otherwise throw.
- Find or create `AuthUser {email, name: fullName || email, emailVerified: false}`. **Payment never verifies the mailbox or grants admin.**
- Upsert `Profile` (same ID). Names update only when supplied.
- `ClientMembership {clientId, userId, role:"owner"}`, skipping duplicates.
- Returns `{userId, existed, needsSetup = no password credential}`.

### 4.4 Upsell purchase (`metadata.kind` = `addon` | `upgrade`, with `metadata.projectId`)
- Dedupe on session ID **or** payment-intent ID.
- **Add-on:** `revisions.limitInt += 1`, or create `{limit 1}`. Audit `entitlement_addon_applied {checkoutSessionId, paymentIntentId, addonKey, revisionDelta:1}`.
- **Upgrade:** for each target-package entitlement, an upsert that **sets `limitInt` to the target value unconditionally** (consumed and reserved are kept), then `project.packageCode = toPackage`. Audit `package_upgrade_applied {…fromPackage,toPackage}`. ⚠️ Finding F-2.
- Order `{FULFILLED, campaignSlug: "addon:extra_revision" | "upgrade:{from}->{to}"}`. Audit `order_fulfilled {…, kind}`.

## 5. Upsell checkout `POST /api/projects/[id]/checkout/session` (C member, Origin-guarded)

- Body `{kind:"addon", addonKey:"extra_revision"}` or `{kind:"upgrade", toPackage}`. Errors: `400 INVALID_JSON`, `INVALID_KIND`, `INVALID_ADDON_KEY`, `INVALID_UPGRADE_PATH`, `UNSUPPORTED_UPGRADE_PATH`. `500 PRICE_NOT_CONFIGURED`, `CHECKOUT_URL_MISSING`, `CHECKOUT_SESSION_FAILED`.
- Session: `mode=payment`, `customer_creation=always`, **no `invoice_creation`** (so upsells only get receipts), metadata `{kind, projectId, addonKey|fromPackage,toPackage, fromPackage}`.
- `success_url = {requestOrigin}/project/{id}?upsell=1&kind={kind}&session_id={CHECKOUT_SESSION_ID}`, `cancel_url = {requestOrigin}/project/{id}`. Returns `200 {url}`. The client then navigates to it.
- The server applies no eligibility rules. The upsell *display* rules live in the UI (`lib/project-hub.ts`, C-04).

## 6. Checkout status and success

- `GET /api/checkout/status?session_id=` → `400 MISSING_SESSION_ID`, otherwise **only** `{fulfilled:boolean, status:"FULFILLED"|"PENDING"}`. A missing order reads as pending. No IDs or PII are returned.
- The checkout auth email endpoints are in `auth-and-security.md` §10.

## 7. Admin reprocess `POST /api/admin/checkout/reprocess` (admin, Origin-guarded)

Body `{session_id}`. Missing → `400 {error:{message:"Missing session_id"}}` (**no code**). Retrieves the session (expand customer), `fulfillCheckoutSession`, then `ensureAccessProvisioning` when there's an email (names not passed). Not paid → `409 CHECKOUT_SESSION_NOT_PAID`. Returns `{ok, deduped, projectId, orderId, clientId, purchaserEmail, orderStatus, provisionedUserId, message}`. ⚠️ It **doesn't send** the customer setup or sign-in email or the admin new-project email (finding F-6). Other errors are rethrown, so the framework returns a 500.

## 8. Invoices (K-11)

- `GET /api/invoices` (all of the user's orders through memberships), `GET /api/projects/[id]/invoices` (member), `GET /api/admin/projects/[id]/invoices` (admin). They share `lib/client-invoices.ts#resolveStripeInvoiceDocument`.
- Item: `{id, projectId, projectName, amountCents, currency, status ("Paid" when FULFILLED, else the raw status), date ISO, invoiceId, invoicePdfUrl, hostedInvoiceUrl, receiptUrl, documentType: invoice|receipt|none, downloadUrl = pdf ?? hosted ?? receipt}`. The project route adds `documentLabel` ("Payment receipt (paid-safe)" | "Invoice"). `projectName` comes from `getProjectDisplayTitle` (brand name from the latest brief answers).
- The resolver's order for settled orders: charge receipt URL first, then a settled session invoice (PDF only, hosted URL removed), then invoice by ID, then the latest charge's invoice, then the receipt, then the payment intent's charge. Stripe errors are logged (IDs and message only) and give `source:"none"`. Port the whole decision tree with unit tests (`client-invoices.test.ts`).
- Each listing makes several Stripe calls per order, with no caching.

## 9. Findings (code vs. logged decisions)

These need an owner decision **before** stories are written. Default for the port: **reproduce the current behaviour** unless the owner decides otherwise.

| # | Finding | Decision on record | Current code | Recommendation |
|---|---|---|---|---|
| F-1 | Promotion codes can't be used at checkout | 2026-03-01: `PRO40FIRST5` via Stripe promotion codes | No `allow_promotion_codes` | Owner: enable in Laravel? (one parameter) |
| F-2 | An upgrade **overwrites** the revision limit with the target tier's value. A bought extra revision is lost (Essential 1+1 → Professional sets 2, not 3) | 2026-03-01: "additive-from-current … increase limits to match the target tier, **or add the delta**" | Sets to the target | Owner: use max(current, target) or current + delta? Recommend **current + (target − old tier)** so paid add-ons survive |
| F-3 | VAT number capture and display isn't built (`Client.vatNumber` is never written; settings says "will be added in a later update") | 2026-03-02: capture optional VAT post-checkout and show on receipts | Not implemented | Owner: in migration scope, or a post-launch story? Recommend post-launch (parity first) |
| F-4 | `campaign_slug` from `/checkout/start` never reaches `ProjectOrder.campaignSlug` | 2026-03-01: campaign attribution into orders | Only in Stripe metadata | Recommend fixing in Laravel (copy from metadata), logged as a deviation |
| F-5 | `success_url` and upsell URLs are built from `X-Forwarded-*`/`Host` headers, not the canonical `PUBLIC_SITE_URL` | Security boundary docs prefer the canonical origin | Header-derived | Recommend the canonical origin in Laravel (a deviation, low risk) |
| F-6 | Admin reprocess fulfils and provisions but sends no customer or admin email | none | Silent | Recommend reprocess runs the same post-fulfilment steps as the webhook |
