# Dependency remediation — 5230

## Pre-change decision record
- Child branch `workbench/dependency-remediation-5230` starts at `af402fc84f79211d0b0567dfa9746b0ff8bda125`; consolidated ref stays untouched.
- Independent npm lockfile-v3 projects in `apps/web` and `apps/site`, no root workspace/shared lockfile. Site remains out of remediation scope; audit and report only.
- Reproduced web audit: 39 affected package nodes (3 critical / 26 high / 8 moderate / 2 low); omit-dev: 22 (1 critical / 15 high / 6 moderate). Site: 17 (1 critical / 13 high / 3 moderate). Counts include transitive/metavulnerabilities, not independent reachable exploits.
- Plan: Next + eslint-config-next 16.1.6 → 16.4.1; React/react-dom 19.2.3 → 19.2.9 (same patch line); Prisma CLI/client/pg adapter 7.4.2 → 7.10.0 together (stable 7, not 8 RC). These support current Node 24.22.0, with peers to be checked after install.
- **Tooling major decision before change:** Vitest 3.2.7 still depends on Tinypool ^1.1.1 (critical findings affect <=2.1.0 / <2.1.2), and @vitest/mocker <4.1.11 is affected by file-read traversal. Use Vitest 4.1.11 to remove that critical worker dependency and patch mocker/UI boundary; inspect config compatibility and run all tests. No browser-mode/coverage plugins in the manifest; current node-only tests use standard mocking/runner APIs. This is an explicit test-tool major, not a framework migration. Do not update to Prisma 8 RC or make major app architecture changes.
- Resolve vulnerable transitives only within parent-compatible ranges; no overrides, forced audit fixes, deleted lockfile, disabled scripts/checks, or risk-hiding reclassification of Prisma dependencies. Where upstream pins remain vulnerable, document rather than force a different major.
- No marketing code/dependency edits, migrations, live services, push, main integration or deployment. The documented queue CLI is absent; checks must be sequential directly, with this limitation disclosed.

Final results and exact remaining-advisory triage will follow below after installation and validation.
