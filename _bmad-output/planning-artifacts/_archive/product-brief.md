# Product Brief: Logo Fountain (Execution Baseline)

> ⚠️ CANONICAL SOURCE — DO NOT OVERWRITE  
> This document is the authoritative product specification input for all BMAD phases.  
> No downstream agent may invent requirements not present here.  
> Ambiguities must trigger HALT.

**Date:** 2026-02-24  
**Owner:** Product Owner Agent  
**Status:** Locked for PRD Phase

---

## 1. Product Vision

Logo Fountain is a premium UK-based logo design service that delivers bespoke, human-designed logos through a structured, auditable digital workflow.

The platform replaces informal email-based delivery with a managed system that enforces quality, transparency, entitlement rules, and predictable turnaround.

It is not a template marketplace or automated generator.

---

## 2. Business Objectives

1. Deliver 50–100 paid projects within first 3 months  
2. Reduce admin handling time to <2 hours per project  
3. Achieve ≥85% completion rate  
4. Maintain ≥50 Net Promoter Score  
5. Enable solo-founder operation at MVP scale  

---

## 3. Target Users & Roles

### 3.1 Client
- Purchases logo packages  
- Submits briefs  
- Reviews concepts  
- Provides feedback  
- Approves final deliverables  

### 3.2 Admin
- Creates and manages projects  
- Assigns designers  
- Uploads concepts and revisions  
- Manages entitlements  
- Handles refunds and disputes  
- Overrides system limits  
- Archives projects  

### 3.3 Designer
- Reviews client briefs  
- Produces concepts and revisions  
- Uploads design assets  
- Responds to feedback  

---

## 4. Core Value Proposition

Clients receive professionally designed logos with:

- Guaranteed revision limits  
- Transparent delivery timelines  
- Centralised communication  
- Secure asset delivery  
- Accountable human designers  

Admins gain:

- Full project oversight  
- Automated entitlement tracking  
- Reduced manual coordination  
- Auditability  

---

## 5. Business Model

### 5.1 Packages

| Package  | Concepts | Revisions | Delivery Target | Price Tier |
|----------|----------|-----------|------------------|------------|
| Basic    | 2        | 2         | 1-2 weeks           | Entry      |
| Pro      | 3        | 4         | 7 days           | Mid        |
| Premium  | 4        | Unlimited | 4 days           | High       |

### 5.2 Upsells
- Extra revision pack (2 revisions)  
- Expedited delivery (+48h reduction)  
- Brand kit bundle  

### 5.3 Payments
- All packages paid upfront via Stripe  
- No subscriptions in MVP  
- Refunds handled manually by Admin  

---

## 6. Project Lifecycle & State Model

### 6.1 Project States
CREATED
→ BRIEF_SUBMITTED
→ IN_DESIGN
→ CONCEPTS_READY
→ IN_REVISION
→ FINAL_APPROVAL
→ DELIVERED
→ ARCHIVED


### 6.2 State Rules
- Only Admin may change states manually  
- Client actions advance states automatically  
- FINAL_APPROVAL locks previous versions  
- DELIVERED projects are read-only  
- ARCHIVED projects are immutable  

---

## 7. MVP Feature Specifications

### 7.1 Authentication & Accounts
- Email + password authentication  
- Optional magic-link login  
- Password reset via email  
- One account per email  
- One account may own multiple projects  
- Sessions expire after 30 days inactivity  

---

### 7.2 Client Onboarding
- Stripe checkout creates pending account  
- Account activated after payment  
- Client completes structured brief  
- Brief must be completed before design begins  

---

### 7.3 Structured Design Brief

Required fields:
- Business name  
- Industry  
- Target audience  
- Preferred styles  
- Colour preferences  
- Competitors  
- Usage context  
- Additional notes  

Submission is immutable after review begins.

---

### 7.4 Project Dashboard

Must display:
- Current state  
- Package entitlements  
- Remaining revisions  
- Uploaded assets  
- Messages  
- Deadlines  
- Download links  
- Activity timeline  

---

### 7.5 Concept & Revision Management
- Designers upload concepts as versioned sets  
- Each upload increments version number  
- Revisions consume entitlements  
- System blocks revisions at zero entitlement  
- Admin may override limits  

---

### 7.6 Feedback System
- Feedback attached per concept version  
- Text comments + file attachments  
- Timestamped  
- Immutable after submission  
- Visible to Admin and Designer  

---

### 7.7 Asset Delivery

Final deliverables include:
- SVG  
- PNG (transparent)  
- PDF  

Rules:
- Versioned  
- Watermarked until approval  
- Download links expire after 90 days  
- Re-download allowed while active  

---

### 7.8 Notifications
- Email notifications for:
  - New uploads  
  - Feedback submitted  
  - Approval requests  
  - Deadline warnings  
- In-app notification centre  

---

### 7.9 Admin Console

Admins can:
- Create/edit projects  
- Assign designers  
- Upload assets  
- Override entitlements  
- Issue refunds  
- View audit logs  
- Generate reports  

---

### 7.10 Permissions Matrix

| Role     | Create Project | Upload Assets | Override Limits | Refund | Approve Final |
|----------|---------------|--------------|-----------------|--------|--------------|
| Client   | No            | No           | No              | No     | Yes          |
| Admin    | Yes           | Yes          | Yes             | Yes    | Yes          |
| Designer | No            | Yes          | No              | No     | No           |

---

## 8. Data & Retention Rules

- All project data retained 24 months  
- Archived projects retained 5 years  
- Deleted accounts anonymised  
- Asset backups daily  
- GDPR compliant export/delete  

---

## 9. Non-Functional Constraints

### Performance
- Dashboard load ≤2s  
- Upload ≤30s for 100MB  
- API p95 ≤500ms  

### Availability
- 99.5% monthly uptime target  

### Security
- Encrypted at rest and transit  
- Role-based access  
- Audit logging  
- OWASP Top 10 compliance  

### Accessibility
- WCAG 2.1 AA  

### Browser Support
- Latest Chrome, Edge, Safari, Firefox  
- Mobile responsive  

---

## 10. Technical Constraints

- Monolithic architecture  
- Avoid microservices  
- Minimal DevOps  
- Managed hosting  
- CI/CD via GitHub Actions  
- Tech stack selection deferred to Architect  

---

## 11. Out of Scope (MVP)

- AI logo generation  
- Public marketplaces  
- Designer self-signup  
- Public portfolios  
- White-label solutions  
- Subscriptions  

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Scope creep | Enforced entitlements |
| Payment disputes | Audit trail |
| Email bypass | Centralised messaging |
| Designer delays | Admin monitoring |

---

## 13. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Refund SLA | Medium |
| 2 | Escalation policy | Medium |
| 3 | Legal T&Cs | High |

---

## 14. Governance Rules

- All changes logged in DECISIONS.md  
- Breaking changes require owner approval  
- Agents must HALT on ambiguity  
- No agent may invent technical choices  

---

## 15. Phase Plan

1. Business Analyst → PRD  
2. Architect → System Design  
3. UX → Interaction Spec  
4. Scrum Master → Delivery Plan  
5. Engineer → Implementation  

---

## 16. Acceptance Criteria for PRD Phase

The PRD is considered complete only if it contains:
- ≥6 user journeys  
- ≥40 functional requirements  
- ≥20 non-functional requirements  
- ≥8 core entities  
- Full API outline  
- No invented assumptions  


