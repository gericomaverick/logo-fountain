# Logo Fountain — Stripe Price Mapping (Allowlist) v1.0

**Date:** 2026-03-01

Goal: define the server-side allowlist mapping between product codes and Stripe price IDs.

> Note: Stripe price IDs do not encode entitlements. Entitlements come from the tier config (Option B).

---

## 1) Packages
| Code | Price (GBP) | Stripe price id |
|---|---:|---|
| essential | 299 | price_REPLACE_ESSENTIAL |
| professional | 499 | price_1ScMRpFM0K9Qd7oXxcBdr8ad |
| complete | 749 | price_1SwQmSFM0K9Qd7oX2CeIAJTa |

## 2) Upgrades / add-ons
| Code | Price (GBP) | Stripe price id | Effect |
|---|---:|---|---|
| essentialToProfessional | 180 | price_1SzFgSFM0K9Qd7oXRfDHdiyO | apply deltas (concepts +1) |
| professionalToComplete | 225 | price_1SzFiqFM0K9Qd7oX5j6yP3C0 | apply deltas (revisions +3) |
| revisionAddon | 49 | price_1SzFmjFM0K9Qd7oX5SrRfRvx | revisions +1 |

## 3) Promo code
- `PRO40FIRST5`: Stripe Promotion Code with redemption limit = 5.

---

## 4) Implementation notes
- Do not accept arbitrary price IDs from the client.
- Client sends `{packageCode, addonCodes}` and server resolves to the Stripe price IDs above.
- For upgrades/add-ons post-purchase, require `target_project_id` in metadata and verify membership.
