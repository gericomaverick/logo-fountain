# Logo Fountain — Sitemap & Screens v1.0

**Date:** 2026-03-01

---

## 1) Public marketing
- `/` — landing
- `/packages` — package comparison + CTA to checkout
- `/checkout/success` — processing + redirect to dashboard
- `/checkout/cancel` — return to packages
- `/privacy`, `/terms`

Screens:
- Landing hero + trust + examples + FAQ
- Packages table (entitlements from Option B) + promo code hint

---

## 2) Auth
- `/login` (email+password + magic-link option)
- `/signup`
- `/reset-password`

---

## 3) Client portal
- `/app` — project list
- `/app/projects/:id` — project detail

Project detail sections:
- Status + “Next action” CTA
- Entitlements counters (concepts/revisions remaining)
- Brief (latest version)
- Concepts (published only)
- Revision requests history
- Messages
- Deliverables downloads (when available)

---

## 4) Admin portal
- `/admin` — queue
- `/admin/projects/:id` — project admin detail

Admin detail sections:
- State machine controls
- Entitlements + override (reason required)
- Brief viewer
- Concept uploader + publish
- Revision request tracker
- Final deliverables upload
- Messages
- Audit trail
