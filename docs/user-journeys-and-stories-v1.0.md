# Logo Fountain — User Journeys & User Stories v1.0

**Date:** 2026-03-01

Source: PRD v1.1 (`projects/logo-fountain/docs/prd-v1.1.md`)

---

## 1) Journey map (MVP/P0)

### J1 — Browse packages → Purchase
**Actor:** Prospect/Client
1. User lands on packages page
2. Compares Essential / Professional / Complete
3. Selects a package (and optionally sees promo code area)
4. Proceeds to Stripe Checkout
5. Completes payment
6. Returns to “Processing your order…” then is routed into dashboard

**Success condition:** Paid order exists; project created; user can sign in and sees “Submit brief”.

---

### J2 — Account creation / sign-in
**Actor:** Client
- User creates an account (email+password) and optionally uses magic-link.
- User can reset password.

**Success condition:** User can reach dashboard and only sees their own projects.

---

### J3 — Submit structured design brief
**Actor:** Client
1. Client opens project
2. Completes structured brief (brand name, industry, audience, style direction, competitors, usage contexts)
3. Uploads any assets/examples
4. Submits brief

**Success condition:** Brief submitted is versioned/locked; project moves to “Brief submitted”.

---

### J4 — Admin reviews brief → posts concepts
**Actor:** Admin
1. Admin sees queue of “Brief submitted” projects
2. Opens project; reviews brief and assets
3. Messages client for clarifications if needed
4. Uploads concepts and publishes

**Success condition:** Client can view concepts; audit event recorded.

---

### J5 — Client feedback + revision loop
**Actor:** Client, Admin
1. Client reviews concept(s)
2. Client submits feedback and optionally requests a revision
3. On submission, system decrements revisions remaining (immediate)
4. Admin uploads revised version and publishes

**Success condition:** Revision requests are tracked, fulfilled, and bounded by entitlements.

---

### J6 — Client approval → final asset delivery
**Actor:** Client, Admin
1. Client approves a concept
2. Admin uploads final deliverables (per package)
3. Client downloads final pack
4. Project marked delivered/completed

**Success condition:** Final assets downloadable and logged; project read-only except downloads/messages.

---

## 2) User stories (P0)

### Epic E1 — Authentication & access control
- **US-AUTH-01**: As a client, I can sign up with email+password so I can access my project portal.
- **US-AUTH-02**: As a client, I can request a password reset so I can regain access.
- **US-AUTH-03**: As a client, I can use a magic-link option so I can log in without a password.
- **US-AUTH-04**: As an admin, I can log into an admin dashboard so I can manage all projects.
- **US-AUTH-05**: As a client, I cannot access other clients’ projects so my data stays private.

### Epic E2 — Packages, checkout, orders
- **US-PAY-01**: As a prospect, I can view packages with what’s included so I can choose confidently.
- **US-PAY-02**: As a prospect, I can pay via Stripe Checkout so payment is quick and trusted.
- **US-PAY-03**: As the system, I fulfill orders via Stripe webhook so payment can’t be spoofed.
- **US-PAY-04**: As a client, I see a “processing” screen until my project is created so I’m not confused.
- **US-PAY-05**: As an admin, I can see order/payment status so I can support customers.

### Epic E3 — Brief intake
- **US-BRIEF-01**: As a client, I can fill a structured brief so the designer has what they need.
- **US-BRIEF-02**: As a client, I can upload example files so I can show references.
- **US-BRIEF-03**: As a client, once I submit the brief it is locked/versioned so we avoid confusion.

### Epic E4 — Concepts & revisions
- **US-CON-01**: As an admin, I can upload concept images so clients can review.
- **US-CON-02**: As an admin, I can publish concepts so clients only see ready work.
- **US-REV-01**: As a client, I can request a revision so I can refine the chosen direction.
- **US-REV-02**: As a client, I see how many revisions remain so expectations are clear.
- **US-REV-03**: As the system, revision requests reduce remaining revisions immediately so entitlement usage is deterministic.
- **US-REV-04**: As the system, if revisions are exhausted, revision action is blocked with next best options.

### Epic E5 — Messaging
- **US-MSG-01**: As a client, I can message the admin/designer inside the project so context is centralized.
- **US-MSG-02**: As an admin, I can message the client so I can ask clarifying questions.

### Epic E6 — Approval & delivery
- **US-APP-01**: As a client, I can approve one concept so we know what to finalize.
- **US-DEL-01**: As an admin, I can upload final files (PNG/SVG/etc) so delivery is complete.
- **US-DEL-02**: As a client, I can download final files so I can use my logo immediately.

### Epic E7 — Audit & governance
- **US-AUD-01**: As an admin, I can view an audit trail so disputes and exceptions are resolvable.
- **US-AUD-02**: As the system, key events are always logged so history is trustworthy.

---

## 3) Acceptance criteria templates (to be used in dev stories)
- Each story should include:
  - Preconditions (auth/state)
  - Happy path
  - Failure states (RLS denial, entitlement exhausted, invalid transition)
  - Audit events emitted
  - Basic UI copy for “next action” clarity
