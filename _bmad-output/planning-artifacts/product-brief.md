# Product Brief: Logo Fountain

**Date:** 2026-02-24  
**Author:** Product Owner Agent

# Product Brief: Logo Fountain

## Executive Summary

Logo Fountain is a premium UK-based logo design service delivered through a structured client portal rather than fragmented email threads.

The product is positioned around bespoke, designer-led logo work — not AI-generated templates or marketplaces. The platform replaces ambiguity with clarity: clear packages, clear lifecycle states, clear entitlements, and clear outcomes.

The MVP focuses on a paid workflow from purchase through brief, concept delivery, revisions, approval, and final asset handoff.

The core value is control and transparency without sacrificing a premium tone.

---

## Problem Statement

Logo design delivery is often inconsistent and unclear.

Key problems:

- Email-first communication fragments context and loses history.
- Clients lack real-time visibility of project status and next actions.
- Revision and concept limits are poorly defined, causing conflict.
- Approval and exception handling are hard to audit.
- Lower-quality marketplaces create distrust in service quality.

Logo Fountain solves this by introducing a controlled, visible lifecycle for every project.

---

## Vision and Core Value Proposition

Deliver a high-trust logo project experience where clients can:

- Select a package with explicit deliverables and limits.
- Submit a structured design brief.
- Review concepts and request revisions in one place.
- Clearly see remaining entitlements.
- Approve a final concept with deterministic lifecycle behavior.
- Download final assets without friction or ambiguity.

Core product promise:

“A premium logo design portal that replaces vague communication with clear status, clear limits, and clear outcomes.”

---

## Service Model and Package Direction

Logo Fountain offers three package tiers with increasing value and flexibility.

### Essential
- Smaller concept and revision allowance.
- Core logo deliverables suitable for practical brand launch.

### Professional
- Expanded concept and revision flexibility.
- Broader asset coverage and deeper refinement.

### Complete
- Highest-touch package.
- Expanded deliverables and extended revision flexibility.
- Stronger support expectations.

Shared package principles:

- Every package includes bespoke, designer-led work.
- Concept and revision allowances are explicit at purchase and in-dashboard.
- Entitlements are enforced by lifecycle state.
- Exceptions require explicit admin action and audit logging.

Final numerical limits and entitlement matrices are defined in the PRD.

---

## Target Users

### Primary Segment: Founders and SMB Operators

- Need credible brand identity quickly.
- Prefer expert-led quality over low-cost template outcomes.
- Value clarity, visibility, and reduced back-and-forth.

### Secondary Segment: Agency / Operator Buyers

- Manage work on behalf of stakeholders.
- Require traceability and deterministic workflow.
- Value auditability and predictable lifecycle behavior.

---

## Core User Journeys (MVP)

### 1. Purchase Journey
- Client compares packages.
- Completes checkout.
- Verifies email.
- Lands in dashboard.
- Begins structured brief.

### 2. Delivery Journey
- Admin reviews brief.
- Concepts uploaded.
- Client reviews concept detail.
- Client submits feedback and revision requests.
- Revision loop continues within entitlement limits.

### 3. Approval and Finalization Journey
- Client approves one concept.
- Other concepts archived from client-facing view.
- Admin uploads final files.
- Project moves to delivered state.

### 4. Entitlement Exhausted Journey
- Revision limit reached.
- Revision action disabled.
- Client sees only valid next actions (approve or purchase add-on if eligible).

### 5. Admin Exception Journey
- Admin may override entitlements in rare cases.
- Each override requires a reason.
- Audit record stored for each exception.

---

## Experience and Product Principles

- Conversion clarity over decorative complexity.
- No hidden state transitions in critical journeys.
- Explicit next action visible at every project state.
- Shared source of truth for client and admin.
- Preserve premium tone while keeping interface operationally clear.
- Deterministic lifecycle transitions (no ambiguous states).

---

## Admin and Operations Requirements (Product-Level)

Admin must be able to:

- View active project queue with explicit states.
- Upload concepts, revisions, and final files.
- View entitlement counters.
- Review project timeline and lifecycle events.
- Respond to client feedback.
- Apply manual entitlement overrides (with mandatory rationale).
- View audit history of key transitions.
- Handle refunds and controlled exception cases.

---

## Success Metrics

### Measurement Window
- Weekly operational review.
- Monthly product review.
- First 90 days post-launch as MVP validation window.

### Funnel Metrics
- Purchase → brief submitted within 24h: ≥ 80%.
- Median purchase-to-brief time: ≤ 24h.
- First concept feedback completion rate: ≥ 70%.
- Paid project completion rate: ≥ 60%.

### Operational Metrics
- Reduce support tickets related to revision/status confusion by ≥ 40%.
- Maintain or improve pricing-page conversion baseline.
- Increase revision add-on adoption once baseline established.

### Reliability Targets
- Authenticated API p95 target: ≤ 500ms.
- Audit coverage for key lifecycle transitions: 100%.
- Payment webhook validation and idempotency: 100%.

---

## MVP Scope

### In Scope

- Package purchase and entitlement initialization.
- Verified email authentication.
- Structured brief submission.
- Concept upload and publishing.
- Revision request loop.
- Entitlement enforcement.
- Add-on purchase path (if eligible).
- Client and admin dashboards.
- Project messaging thread.
- Audit trail for lifecycle transitions.
- Event-specific campaign landing pages.

### Out of Scope (MVP)

- Native mobile apps.
- Multi-language support.
- Public marketplace for designers.
- AI logo generation.
- Advanced collaboration beyond core workflow.

---

## Event-Specific Conversion Landing Pages

The product must support campaign-style, event-specific landing pages for targeted acquisition.

Product-level requirements:

- Create event-tailored pages with customized headline, copy, and CTA.
- Maintain core service and fulfillment constraints.
- Track conversion performance per event.
- Support copy and tone variation per event context.
- Ensure campaign variants do not alter backend workflow or entitlements.

Business objective:

Increase conversion by aligning messaging tone with audience context while keeping delivery workflow identical.

---

## Risks and Assumptions

### Assumptions

- Clients respond positively to explicit entitlements and visible counters.
- Dashboard-based communication reduces friction vs email-first workflow.
- Transparent lifecycle states reduce support load.

### Risks

- Revision flexibility in higher tiers may create operational strain.
- Incomplete package wording may create expectation mismatch.
- Storage or payment integration decisions may impact implementation.
- Upgrade and exception paths may introduce billing complexity.

---

## Open Questions

- Final fair-use definition for highest tier revisions.
- SLA language per package tier.
- Exact deliverable matrix per package.
- Upgrade/proration rules.
- Notification policy for admin exceptions.
