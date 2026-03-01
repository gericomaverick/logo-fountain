# Logo Fountain — Event/Campaign Landing Pages v1.0

**Date:** 2026-03-01

Goal: support creating targeted landing pages for **local business events** (e.g., “New salon opening”, “Spring promotion”, “Local expo offer”) outside the dashboard, with simple tracking and a direct path into checkout.

---

## 1) Requirements
### P1 scope (recommended)
- Public route: `/c/[slug]`
- Landing page content is CMS-like but simple (stored in DB as JSON / markdown blocks)
- CTAs route to checkout with campaign attribution
- Optional: limited-time offer messaging (copy only) and/or promo code display

### Out of scope (for now)
- Complex page builder
- A/B testing platform
- Multi-step funnel builder

---

## 2) Data model (minimal)
Table: `campaign_pages`
- `id` (uuid)
- `slug` (unique)
- `title`
- `status` (`draft|published|archived`)
- `hero` (jsonb: headline, subhead, badge)
- `body_blocks` (jsonb: sections)
- `cta` (jsonb: package_code default, button text)
- `offer` (jsonb: e.g., promo_code, expires_at, note)
- `seo` (jsonb: meta title/description)
- `created_by` (admin)
- `created_at`, `updated_at`, `published_at`

Tracking fields:
- `utm_source_default`, `utm_medium_default`, `utm_campaign_default` (optional)

---

## 3) Checkout attribution
When navigating from `/c/[slug]` to checkout, include:
- `campaign_slug`
- UTM params (pass-through)

Store in:
- `project_orders.campaign_slug` (or `meta` json)
- Stripe Checkout metadata: `campaign_slug`

---

## 4) Admin UX
Admin screens (P1):
- `/admin/campaigns` list
- `/admin/campaigns/new`
- `/admin/campaigns/[id]` edit + publish

Constraints:
- Only admins can create/edit/publish.

---

## 5) Acceptance criteria
- A published campaign page renders in <2s and has a single primary CTA.
- Creating a checkout session from a campaign persists `campaign_slug` into order metadata.
- Draft pages are not publicly visible.
