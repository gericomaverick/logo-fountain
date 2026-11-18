# Story conversion record: sections to add to every BMAD story file

Add these sections to the story file that `create-story` generates (as the "Dev Agent Record" part). Fill every section. Write "none" rather than leaving one out.

## Inventory scope
IDs covered: e.g. `A-07, A-08, N-03`. Each one must end up `Verified` or be explicitly deferred to a named story.

## Next.js source read
Files read (with paths), plus the docs read.

## Behaviour notes (write this BEFORE converting)
What the old code really does: inputs, outputs, status codes, error codes, side effects (DB rows, audit events, emails, system messages, storage), ordering and transactions, locks, edge cases, timeouts and limits. Quote the constants.

## Laravel implementation
Files created or changed, and where each behaviour lives (routes, controllers, actions, models, jobs, mailables, middleware, Inertia pages).

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
Test-port ledger rows resolved:

## Test evidence
Commands run, with counts (passed / failed / skipped), for: Laravel L0–L2 (and L3), parity tags against Laravel, parity tags against Next, the regression tags.
**Not run, and why:**

## Gotchas
Anything surprising. Mark the ones promoted to `apps/portal/AGENTS.md`.

## Docs updated
Inventory · sprint-status · converted-tags · handoff · runbooks · ADRs · DECISIONS/RISKS/ASSUMPTIONS.

## Open items
Follow-ups with an owner and the story they belong to.
