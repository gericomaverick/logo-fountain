# ADR-015: One FulfilCheckout action plus one CompleteFulfilmentSideEffects action

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** K-05…K-12

## Decision

One `FulfilCheckout` action plus one `CompleteFulfilmentSideEffects` action, shared by the webhook and admin reprocess (DV-6). Upgrade maths is additive (DV-2)

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
