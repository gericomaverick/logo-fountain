# Logo Fountain — Dev Start Packet v1.0

**Date:** 2026-03-01

This index is the handoff bundle to begin implementation.

## 1) Product + Requirements
- PRD: `docs/prd-v1.1.md`
- Product brief: `docs/product-brief-v1.0.md`
- Journeys + stories: `docs/user-journeys-and-stories-v1.0.md`
- Entitlement calibration (Option B): `docs/entitlement-calibration-v1.0.md`

## 2) Architecture (pre-dev)
- Architecture overview: `docs/architecture-predev-v1.0.md`
- RLS matrix: `docs/rls-matrix-v1.0.md`
- API contract: `docs/api-contract-v1.0.md`
- Stripe state machine: `docs/stripe-state-machine-v1.0.md`

## 3) UX / IA
- Sitemap + screens: `docs/sitemap-and-screens-v1.0.md`

## 4) Governance
- Decisions: `docs/governance/DECISIONS.md`
- Risks: `docs/governance/RISKS.md`
- Assumptions: `docs/governance/ASSUMPTIONS.md`

## 5) Remaining pre-dev TODOs (before coding)
1. Confirm where the marketing site copy/JSON will be updated to match Option B entitlements.
2. Confirm whether VAT-number capture is required at checkout or post-purchase (recommend post-purchase in client profile).
3. Decide how to represent deliverables packaging:
   - single ZIP for finals vs individual downloads + ZIP
4. Decide whether client accounts are created before checkout or post-checkout (recommend post-checkout with invite/magic-link).
5. Stripe setup tasks checklist:
   - Coupon + promo code (PRO40FIRST5) with redemption limit 5
   - Price IDs stored in server allowlist table/config

When these are confirmed, we can start implementation.
