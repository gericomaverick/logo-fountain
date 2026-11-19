# ADR-014: Stripe

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** K-series, DV-1, DV-4, DV-5

## Decision

Stripe: `stripe/stripe-php ^22.1`, `StripeClient` with `stripe_version=2026-02-25.clover`. The webhook uses the raw body with `Webhook::constructEvent` and the **existing lease-and-claim `stripe_events` ledger**. `allow_promotion_codes=true` on every session. Return URLs come from the canonical origin. No Cashier

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
