# ADR-018: Email has two modes

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** A-11, N-series, DV-8, DV-9

## Decision

Email has two modes. **Auth links** are synchronous after the fence commits; on failure the proof is deleted and a fixed error returned. **Lifecycle** emails are queued `afterCommit` mailables with retries, deduped by `email_sent:*` audit markers. Postmark transport with stream `outbound`

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
