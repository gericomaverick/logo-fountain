# Logo Fountain — State Machine v1.0

**Date:** 2026-03-01

Canonical project lifecycle. Transitions must be validated server-side and logged to `audit_events`.

---

## 1) States
Client-visible states (aligned to PRD):
1. `AWAITING_BRIEF`
2. `BRIEF_SUBMITTED`
3. `IN_DESIGN`
4. `CONCEPTS_READY`
5. `REVISIONS_IN_PROGRESS`
6. `AWAITING_APPROVAL`
7. `FINAL_FILES_READY`
8. `DELIVERED`

Admin-only/supporting states:
- `ON_HOLD`
- `CANCELLED`
- `REFUNDED`

---

## 2) Transition table
Each transition lists: **From → To**, who can trigger, and required preconditions.

### Purchase/Fulfillment
- (none) → `AWAITING_BRIEF`
  - Trigger: ServiceRole (Stripe fulfillment)
  - Preconditions: paid order, project created, entitlements created

### Brief
- `AWAITING_BRIEF` → `BRIEF_SUBMITTED`
  - Trigger: Client
  - Preconditions: brief valid; project not cancelled/refunded

### Design start
- `BRIEF_SUBMITTED` → `IN_DESIGN`
  - Trigger: Admin
  - Preconditions: admin acknowledged brief (optional checklist)

### Concepts
- `IN_DESIGN` → `CONCEPTS_READY`
  - Trigger: Admin concept publication domain action
  - Preconditions: ≥1 concept uploaded; a `concepts` entitlement row exists; a finite entitlement has remaining capacity (null limit is unlimited)
  - Atomicity: first publication and entitlement consumption commit in one serializable transaction; already-published retries do not consume; concurrent final-slot claims cannot both succeed

### Revisions loop
- `CONCEPTS_READY` → `REVISIONS_IN_PROGRESS`
  - Trigger: Client (revision request)
  - Preconditions: revisions_remaining > 0

- `REVISIONS_IN_PROGRESS` → `CONCEPTS_READY`
  - Trigger: Admin
  - Preconditions: revision delivered/published (client to review)

### Approval
- `CONCEPTS_READY` → `AWAITING_APPROVAL`
  - Trigger: Admin
  - Preconditions: admin indicates “ready for approval” (optional)

- `AWAITING_APPROVAL` → `FINAL_FILES_READY`
  - Trigger: Admin
  - Preconditions: final files uploaded (or set to ready after upload)

- `CONCEPTS_READY` → `FINAL_FILES_READY`
  - Trigger: Admin
  - Preconditions: client approved a concept AND finals uploaded

- `FINAL_FILES_READY` → `DELIVERED`
  - Trigger: Client (download acknowledged) OR Admin (mark delivered)
  - Preconditions: finals exist

### Exceptional
- any permitted state → `ON_HOLD`
  - Trigger: constrained Admin status action
  - Preconditions: reason required

- `ON_HOLD` → prior state
  - Trigger: Admin
  - Preconditions: reason required

- any permitted state → `CANCELLED`
  - Trigger: constrained Admin status action
  - Preconditions: reason required

The generic Admin status action cannot enter concepts/revisions/approval/finals/delivery states. Those transitions are owned by domain actions that enforce their records and preconditions.

### Clean-slate reset
- Trigger: Admin with explicit clean-slate confirmation
- Serializes against final publication with a project status/version guard.
- Removes active concepts, revision requests/comments, concept asset rows, and final publication (`final_zip`) rows; resets both consumed and reserved concept/revision usage.
- Retains immutable final storage bytes and audits their exact paths so issued signed URLs can expire; deleted publication rows ensure those objects cannot become active later.

- any → `REFUNDED`
  - Trigger: ServiceRole (refund webhook) + Admin policy

---

## 3) Audit events (minimum)
Emit events:
- `order_paid`, `order_fulfilled`
- `brief_submitted`
- `state_changed`
- `concept_uploaded`, `concept_published`
- `revision_requested` (consumes entitlement)
- `revision_delivered`
- `concept_approved`
- `finals_uploaded`
- `delivered`
- `entitlement_adjusted` (add-on/upgrade/override)
- `campaign_checkout_started` (if campaign slug present)

---

## 4) Notes
- Keep “one primary CTA” per state in UI.
- Don’t let clients approve before any published concept exists.
- Revisions are consumed immediately upon request creation (Decision).
