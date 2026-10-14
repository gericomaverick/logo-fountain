# Logo Fountain — API Contract v1.0 (Pre-Dev)

**Date:** 2026-03-01

This is a lightweight contract for Next.js route handlers / API endpoints.

Conventions:
- All responses JSON unless file download.
- Errors use `{ error: { code, message, details? } }`.

---

## 1) Public / Checkout

### POST `/api/checkout/session`
Create Stripe Checkout session.

Request:
```json
{ "packageCode": "essential|professional|complete", "addons": [{"code":"revisionAddon","qty":1}], "upgrade": null }
```
Response:
```json
{ "checkoutUrl": "https://checkout.stripe.com/...", "orderId": "uuid" }
```
Errors:
- `INVALID_PACKAGE`
- `INVALID_ADDON`
- `NOT_AUTHENTICATED` (if you require auth pre-checkout)

### GET `/api/checkout/status?session_id=cs_...`
Used by success page polling.

Response:
```json
{ "status": "PENDING", "fulfilled": false }
```
`status` is only `PENDING` or `FULFILLED`. This public bearer-style lookup does not return internal order/project IDs or Stripe/customer diagnostics.

### POST `/api/stripe/webhook`
Stripe webhook receiver (signature verified). Paid completion and delayed-payment success use the same claimed/idempotent fulfillment path; delayed-payment failure is recorded without provisioning. Retryable processing/side-effect failures return non-2xx.

---

## 2) Client portal

### GET `/api/projects`
Response:
```json
{ "projects": [{"id":"uuid","status":"...","nextAction":"submit_brief|review_concepts|approve|download"}] }
```

### GET `/api/projects/:projectId`
Returns project, entitlements, latest brief, concepts (published), messages (paged).

### POST `/api/projects/:projectId/briefs`
Create new brief version.

Request (example):
```json
{ "answers": {"brandName":"...","industry":"..."} }
```
Response:
```json
{ "briefId": "uuid", "version": 1 }
```

### POST `/api/projects/:projectId/messages`
Request:
```json
{ "body": "text" }
```

### POST `/api/projects/:projectId/revision-requests`
Creates a revision request and **consumes 1 revision** immediately.

Request:
```json
{ "conceptId": "uuid", "body": "Please adjust..." }
```
Errors:
- `ENTITLEMENT_EXHAUSTED`
- `INVALID_STATE_TRANSITION`

### POST `/api/projects/:projectId/approve`
Request:
```json
{ "conceptId": "uuid" }
```

---

## 3) Admin portal

### GET `/api/admin/projects?status=...`
List projects by status.

### POST `/api/admin/projects/:projectId/state`
Request:
```json
{ "to": "IN_PROGRESS|CONCEPTS_READY|FINAL_READY|DELIVERED", "reason": "optional" }
```

### POST `/api/admin/projects/:projectId/concepts`
Upload metadata for a concept (file handled separately).

### POST `/api/admin/projects/:projectId/finals`
Upload a final deliverable set to a new immutable/versioned storage path, then transactionally publish the new exact asset record under project-status and approval guards. The active final is always the newest row by `createdAt DESC, id DESC`. Superseded `FileAsset` rows and storage objects are retained so already-issued one-hour signed URLs remain valid; only a newly uploaded object whose publication transaction fails is cleaned up best-effort. If final-ready client email cannot be sent, the response is an actionable `502`/`503` partial failure with `committed: true`; the admin retries notification through `POST /api/admin/projects/:projectId/finals/notify` without republishing bytes.

### POST `/api/admin/projects/:projectId/finals/notify`
Admin-only notification retry for the already-current final publication. Revalidates project state, approval, and the deterministic current final asset, then sends only the final-ready notification using an asset-scoped sent marker. It never uploads, republishes, or deletes storage objects.

### POST `/api/admin/projects/:projectId/override-entitlements`
Request:
```json
{ "key": "revisions", "delta": 1, "reason": "goodwill" }
```

---

## 4) Error codes (initial)
- `NOT_AUTHENTICATED`
- `NOT_AUTHORIZED`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `INVALID_STATE_TRANSITION`
- `ENTITLEMENT_EXHAUSTED`
- `STRIPE_WEBHOOK_INVALID_SIGNATURE`
- `STRIPE_EVENT_DUPLICATE`
