# Logo Fountain — QA & Acceptance Checklist v1.0

**Date:** 2026-03-01

Goal: define the “done means done” checks for P0.

---

## A) Auth & Access
- [ ] Client can sign up/sign in with email+password
- [ ] Magic-link sign-in works (optional) and does not break password login
- [ ] RLS prevents cross-client data access (manual test with two accounts)
- [ ] Admin routes are inaccessible to non-admins

## B) Checkout & Fulfillment
- [ ] Checkout session created server-side from allowlist price IDs
- [ ] Success page does not fulfill; it only polls status
- [ ] `checkout.session.completed` fulfills idempotently
  - [ ] Replay webhook does not duplicate project/order
- [ ] Refund webhook updates order + project state policy correctly
- [ ] Dispute event places project on hold (if implemented P0)

## C) Entitlements
- [ ] Project entitlements match Option B:
  - Essential: 2 concepts / 2 revisions
  - Professional: 3 concepts / 2 revisions
  - Complete: 3 concepts / 5 revisions
- [ ] Revision request consumes revision immediately
- [ ] When revisions = 0: request blocked + clear UI
- [ ] Extra revision add-on increases revision limit correctly

## D) Brief
- [ ] Brief required fields validated
- [ ] Brief submission creates a locked version
- [ ] Brief attachments stored privately

## E) Concepts & Revisions
- [ ] Admin can upload concept assets to storage
- [ ] Concepts are invisible to client until published
- [ ] Client can view published concepts
- [ ] Revision request links to a concept and is trackable
- [ ] Admin can publish revision updates

## F) Approval & Delivery
- [ ] Client can approve a single concept
- [ ] Admin can upload final deliverables
- [ ] Client can download finals via signed URLs
- [ ] Delivery is logged in audit trail

## G) Messaging
- [ ] Client/admin can message in-project
- [ ] Attachments (if in scope) stored privately and authorized

## H) Audit
- [ ] Audit events exist for:
  - paid/fulfilled
  - brief submitted
  - concept published
  - revision requested
  - approval
  - finals uploaded
  - entitlement override

## I) VAT number capture (not VAT registered)
- [ ] Client can store VAT number (optional)
- [ ] Receipts/invoices text shows “VAT not charged (supplier not VAT registered)”
