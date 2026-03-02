# PRD Addendum — 2026-03-02 (Locks)

This addendum closes the remaining open items in `docs/prd-v1.1.md`.

## Locked decisions
1. **Account creation timing:** post-checkout (invite/magic-link). No pre-signup requirement.
2. **Final deliverables packaging:** primary delivery is a **single ZIP** download.
3. **VAT number capture:** optional field in client profile post-checkout.
4. **VAT number display:** when present, include client VAT number on receipts/invoices even when VAT is £0 (supplier not VAT registered).

## Implications (implementation)
- Checkout success page must support “processing” + polling until webhook fulfillment completes, then route the user into auth/access provisioning.
- Delivery UI should treat the ZIP as the canonical artifact; additional individual downloads can be P1.
