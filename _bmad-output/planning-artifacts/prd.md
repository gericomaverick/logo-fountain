# Product Requirements Document: Logo Fountain

**Version:** 1.0  
**Date:** 2026-02-24  
**Author:** Business Analyst Agent  
**Status:** Baseline Specification

---

## Document History

| Version | Date       | Author   | Changes               |
|---------|------------|----------|------------------------|
| 1.0     | 2026-02-24 | BA Agent | Initial full PRD       |

---

## 1. Introduction

### 1.1 Purpose

This PRD supersedes all previous versions. Downstream agents must treat this as authoritative.
This document defines the functional and non-functional requirements for the Logo Fountain platform. It provides an implementation-ready specification for engineering, design, and delivery teams.

### 1.2 Scope

This PRD covers all MVP functionality for the Logo Fountain platform, including client onboarding, project management, design delivery, revision handling, and administrative controls.

### 1.3 References

- Product Brief: `_bmad-output/planning-artifacts/product-brief.md`
- Decisions Log: `DECISIONS.md`

---

## 2. Product Overview

### 2.1 Product Vision

Logo Fountain delivers bespoke, human-designed logos through a structured, auditable digital workflow that ensures predictable quality, transparency, and turnaround.

### 2.2 Target Users

| Role     | Description                              |
|----------|------------------------------------------|
| Client   | Purchases and manages logo projects      |
| Admin    | Oversees operations and delivery         |
| Designer | Produces and uploads creative assets     |

### 2.3 Success Metrics

- ≥85% project completion rate
- <2h admin time per project per week
- ≥50 NPS
- ≥20% repeat customers
- ≤5% refund rate

---

## 3. User Journeys

### UJ-1: Client Onboarding & Brief Submission

**Persona:** Client  
**Goal:** Purchase package and submit design brief

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Select package | Display checkout |
| 2 | Complete payment | Create account |
| 3 | Verify email | Activate account |
| 4 | Submit brief | Validate and save |

**Success:** Project enters IN_DESIGN  
**Failure:** Payment/validation error

---

### UJ-2: Concept Delivery

**Persona:** Admin / Designer  
**Goal:** Upload design concepts

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Upload files | Validate format |
| 2 | Save version | Increment version |
| 3 | Publish | Notify client |

---

### UJ-3: Client Feedback & Revision

**Persona:** Client  
**Goal:** Provide feedback and request revision

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | View concept | Display assets |
| 2 | Submit feedback | Store feedback |
| 3 | Request revision | Decrement entitlement |

---

### UJ-4: Final Approval & Delivery

**Persona:** Client  
**Goal:** Approve and download assets

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Approve | Lock versions |
| 2 | Generate links | Enable downloads |
| 3 | Download | Log activity |

---

### UJ-5: Admin Override & Refund

**Persona:** Admin  
**Goal:** Resolve disputes

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Review case | Load audit |
| 2 | Override/refund | Update records |

---

### UJ-6: Project Archival

**Persona:** Admin  
**Goal:** Archive completed project

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Archive | Lock project |
| 2 | Retain | Apply retention |

---

## 4. Functional Requirements

### 4.1 Authentication & Accounts

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-001 | Support email/password login | Must |
| FR-AUTH-002 | Support magic link login | Must |
| FR-AUTH-003 | Enforce password reset flow | Must |
| FR-AUTH-004 | Enforce session expiry | Must |
| FR-AUTH-005 | Allow multi-project accounts | Must |

---

### 4.2 Client Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CLI-001 | View project dashboard | Must |
| FR-CLI-002 | View package entitlements | Must |
| FR-CLI-003 | Submit design brief | Must |
| FR-CLI-004 | Submit feedback | Must |
| FR-CLI-005 | Approve final assets | Must |
| FR-CLI-006 | Download deliverables | Must |

---

### 4.3 Project Workflow

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PROJ-001 | Enforce state machine | Must |
| FR-PROJ-002 | Prevent invalid transitions | Must |
| FR-PROJ-003 | Support manual overrides | Must |
| FR-PROJ-004 | Track deadlines | Should |

---

### 4.4 Concepts & Revisions

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CON-001 | Upload versioned concepts | Must |
| FR-CON-002 | Maintain version history | Must |
| FR-CON-003 | Consume revision entitlement | Must |
| FR-CON-004 | Block zero entitlement | Must |
| FR-CON-005 | Support upsell purchase | Should |

---

### 4.5 Feedback System

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-FBK-001 | Attach feedback to version | Must |
| FR-FBK-002 | Support attachments | Must |
| FR-FBK-003 | Lock feedback post-submit | Must |

---

### 4.6 Asset Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AST-001 | Store assets securely | Must |
| FR-AST-002 | Watermark until approval | Must |
| FR-AST-003 | Generate expiring links | Must |
| FR-AST-004 | Log downloads | Must |

---

### 4.7 Notifications

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-NOT-001 | Email notifications | Must |
| FR-NOT-002 | In-app notifications | Must |
| FR-NOT-003 | Deadline reminders | Should |

---

### 4.8 Admin Console

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ADM-001 | Create/edit projects | Must |
| FR-ADM-002 | Assign designers | Must |
| FR-ADM-003 | Override limits | Must |
| FR-ADM-004 | Issue refunds | Must |
| FR-ADM-005 | View audit trail | Must |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement |
|----|-------------|
| NFR-PERF-001 | Page load ≤2s |
| NFR-PERF-002 | Upload ≤30s (100MB) |
| NFR-PERF-003 | API p95 ≤500ms |

---

### 5.2 Security

| ID | Requirement |
|----|-------------|
| NFR-SEC-001 | Encryption in transit/rest |
| NFR-SEC-002 | RBAC enforcement |
| NFR-SEC-003 | Audit logging |
| NFR-SEC-004 | OWASP Top 10 |

---

### 5.3 Scalability

| ID | Requirement |
|----|-------------|
| NFR-SCL-001 | Support 1k active projects |
| NFR-SCL-002 | Horizontal scale-ready |

---

### 5.4 Accessibility

| ID | Requirement |
|----|-------------|
| NFR-A11Y-001 | WCAG 2.1 AA |

---

## 6. Data Model

### 6.1 Core Entities

| Entity | Key Attributes |
|--------|----------------|
| User | id, email, role, status |
| Project | id, state, packageId |
| Package | id, limits |
| Concept | id, version, files |
| Feedback | id, text, attachments |
| Asset | id, type, url |
| Entitlement | id, remaining |
| Notification | id, status |
| AuditLog | id, action, actor |

### 6.2 Relationships

- User 1:N Project
- Project 1:N Concept
- Concept 1:N Feedback
- Project 1:1 Package
- Project 1:N Asset
- Project 1:N AuditLog

---

## 7. API Overview

### 7.1 Authentication
- POST /auth/login
- POST /auth/magic
- POST /auth/reset

### 7.2 Project
- GET /projects
- POST /projects
- PUT /projects/{id}/state
- POST /projects/{id}/archive

### 7.3 Concepts
- POST /projects/{id}/concepts
- GET /concepts/{id}
- POST /concepts/{id}/publish

### 7.4 Feedback
- POST /concepts/{id}/feedback

### 7.5 Assets
- POST /projects/{id}/assets
- GET /assets/{id}/download

### 7.6 Admin
- POST /admin/refund
- POST /admin/override

---

## 8. Assumptions & Dependencies

### Assumptions
- Clients primarily use platform
- Designers follow workflow
- Email deliverability maintained

### Dependencies
- Stripe for payments
- Email service provider
- Cloud storage provider

---

## 9. Out of Scope

- AI logo generation
- Public designer marketplace
- White-label deployments
- Subscription billing

---

## 10. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Refund SLA | Medium |
| 2 | Escalation policy | Medium |
| 3 | Legal T&Cs | High |

---

## 11. Glossary

| Term | Definition |
|------|------------|
| Entitlement | Remaining revision allowance |
| Concept | Uploaded design iteration |
| State Machine | Controlled workflow |
