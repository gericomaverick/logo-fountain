# Consolidated integration — 5230

## Summary
- Consolidated on isolated `workbench/consolidated-integration-5230`, based on approved `bfaac3293f84a3259c730e0e3e23aaba6e87ea6e`; no main integration or deployment.
- Preserved emergency final retention / notification safety, upload/lifecycle accounting, and application-security protections; fixed per-field override polling clobber.
- Final validation: 87 unit files / 555 tests; typecheck; lint 0 errors / 1 existing warning; webpack build 31 pages; owned-port Chromium Playwright 6/6.
- Read-only lockfile audit: 39 affected packages, 3 critical / 26 high / 8 moderate / 2 low; dependencies unchanged. Separate reviewed remediation is needed before treating this as launch-ready.
- No live database/provider/concurrency checks, migrations, installs, lockfile changes, push, or deployment. Queue script unavailable; validation ran sequentially directly.
- Original emergency ref and primary dirty worktree preserved. Remaining storage/email/provider limitations are detailed below.

## Ancestry and reconciliation
The upload/lifecycle source is a linear chain, not independent competing branches:
`bfaac32 → 0b05448 (uploads) → ad72064 (lifecycle) → bf9be13 (critic reconciliation)`.
Security is `bfaac32 → c40cc40 → dd471f5 → c3faf6c`.
New branch merges upload/lifecycle in `fbfa67a` and security in `680a6fd`; subsequent integration fixes/docs are recorded by this branch's final commit. Report range is `bfaac32..workbench/consolidated-integration-5230`.

Textual overlaps in concept publication and entitlement tests, disabled entitlement reset, and TODO were reconciled semantically: retain serializable publication/usage fences, reason-required audit behavior and disabled usage-only reset, while rejecting untrusted mutation origins before auth/I/O. Security request-origin/auth implementation remains identical to security HEAD. Same-origin headers were added to new lifecycle test fixtures, not relaxed in production. Both concept/final routes retain immutable unique upload paths; concept receipts preserve request identity, digest and ambiguous outcome recovery. Hold/resume fences, deletion usage durability and clean-slate safeguards remain present.

The upload reconciliation had reintroduced catch-path deletion for a typed final callback abort. Removed it to preserve the owner's stricter emergency policy: **every final publication transaction exception** attempts exact-row recovery, retaining uploaded bytes even if immediate verification finds no row. Typed optimistic conflicts return retained-object metadata; unknown verification remains distinct from recovered committed state. Superseded finals remain retained indefinitely. Asset-scoped notification markers and at-least-once delivery behavior remain intact, including live UI success clearing on notification conflict.

## Polling fix
Polling previously captured dirty state from the first render and could overwrite edits. The admin page now supplies a ref with independent concepts/revisions dirty flags to `refreshOverrideInputs` after awaiting snapshot retrieval. Edits protect only their own field; untouched fields still track server state. Successful save clears flags before refreshing; failed saves retain dirty state. Existing reason-required and partial-field PATCH semantics are preserved. Reason text itself is not refreshed by polling. Two helper regressions cover a callback captured before edits, independent fields, post-save reset, unlimited and missing values. This is helper-level regression coverage, not a mounted admin browser interaction test.

## Validation and evidence
Shared existing dependencies were linked temporarily; no install/update performed. Commands ran sequentially in `apps/web`. The documented `scripts/test-queue.mjs` was not present (`MODULE_NOT_FOUND` on status); runs were direct rather than shared-script jobs. This is a scheduling limitation, not a queued-job success claim.

- Initial `npm run test`: 550 passed / 5 failed; merged lifecycle test fixtures omitted required origin headers (one unconsumed mock also affected the next reset test). Initial typecheck found a stale removed UI setter. These were corrected without weakening guards.
- Focused affected routes + polling helper: 4 files / 16 tests pass.
- Final `npm run test`: **87 files / 555 tests pass**.
- Final `npm run typecheck`: pass.
- Final `npm run lint`: pass, **0 errors / 1 existing header-nav `<img>` warning**.
- `npm run build -- --webpack`: pass, **31 generated pages**, placeholder-only environment. No service/database actions.
- `npm run test:e2e -- --config=playwright.integration-5230.config.ts`: **6/6 Chromium tests pass**. Temporary config copied base config, used `http://127.0.0.1:45230`, managed its own webpack dev server with `reuseExistingServer: false`; port checked free first and closed afterward. Temporary config removed.
- `git diff --check`: pass. Original emergency ref remains exactly `bfaac3293f84a3259c730e0e3e23aaba6e87ea6e`.
- Primary remains on `harden-password-change` with its original two tracked modifications and 15 untracked test files; no commands wrote there. Integration dependency symlink removed after validation.
- Lockfile SHA-256 unchanged: `851a41e2a8a63a62148de0acf3d299336e26b943e954d4c86d12e187ec2ba231`.

Artifacts (full logs and audit JSON): `/home/openclaw/.openclaw/workspace/projects/workbench/data/logo-fountain/reports/consolidated-integration-5230-artifacts/`.

## Read-only dependency audit
Ran `npm audit --ignore-scripts --package-lock-only --json`; registry audit succeeded and returned vulnerability exit status (not an installation failure). Counts are npm's affected-package totals, including metavulnerabilities, not 39 independent exploitable defects: **3 critical, 26 high, 8 moderate, 2 low, 0 info**. Package manifests and lockfiles untouched. Reachability was not proven by this audit.

Priority: separately review a compatible Next 16 update (registry proposes 16.4.1) with its PostCSS/sharp chain; verify framework/auth/image regressions and deployment platform exposure. Critical Next advisories include Windows-hosted RCE and AVIF image-optimization RCE. Critical Vitest UI-server and Tinypool worker-option advisories are tooling risks: do not expose dev/test servers; review a compatible patched test stack. npm suggests Prisma **6.19.3** and eslint-config-next **14.2.35** with `isSemVerMajor: true`; these are not approved automatic remedies and may be downgrades relative to installed lines. Investigate patched supported current-line tooling/transitives, compatibility and advisory reachability, rather than apply `audit fix --force`. Other compatible resolutions should be handled in a dedicated dependency PR, with owner-approved lockfile changes and the same validation gates.

| Package | Severity | Registry remediation suggestion |
| --- | --- | --- |
| `@babel/core` | low | compatible resolution available (review) |
| `@chevrotain/cst-dts-gen` | moderate | prisma 6.19.3 (major flag; manual review) |
| `@chevrotain/gast` | moderate | prisma 6.19.3 (major flag; manual review) |
| `@hono/node-server` | high | prisma 6.19.3 (major flag; manual review) |
| `@humanfs/node` | moderate | compatible resolution available (review) |
| `@mrleebo/prisma-ast` | moderate | prisma 6.19.3 (major flag; manual review) |
| `@next/eslint-plugin-next` | high | eslint-config-next 14.2.35 (major flag; manual review) |
| `@prisma/config` | high | prisma 6.19.3 (major flag; manual review) |
| `@prisma/dev` | high | prisma 6.19.3 (major flag; manual review) |
| `@vitest/mocker` | moderate | compatible resolution available (review) |
| `baseline-browser-mapping` | moderate | compatible resolution available (review) |
| `brace-expansion` | high | compatible resolution available (review) |
| `braces` | high | eslint-config-next 14.2.35 (major flag; manual review) |
| `browserslist` | high | compatible resolution available (review) |
| `chevrotain` | moderate | prisma 6.19.3 (major flag; manual review) |
| `deepmerge-ts` | high | prisma 6.19.3 (major flag; manual review) |
| `defu` | high | compatible resolution available (review) |
| `effect` | high | prisma 6.19.3 (major flag; manual review) |
| `esbuild` | low | compatible resolution available (review) |
| `eslint-config-next` | high | eslint-config-next 14.2.35 (major flag; manual review) |
| `fast-glob` | high | eslint-config-next 14.2.35 (major flag; manual review) |
| `flatted` | high | compatible resolution available (review) |
| `hono` | high | prisma 6.19.3 (major flag; manual review) |
| `js-yaml` | high | compatible resolution available (review) |
| `lodash` | high | prisma 6.19.3 (major flag; manual review) |
| `micromatch` | high | eslint-config-next 14.2.35 (major flag; manual review) |
| `mysql2` | high | prisma 6.19.3 (major flag; manual review) |
| `nanoid` | high | compatible resolution available (review) |
| `next` | critical | next 16.4.1 (same-major proposal) |
| `picomatch` | high | compatible resolution available (review) |
| `postcss` | high | next 16.4.1 (same-major proposal) |
| `prisma` | high | prisma 6.19.3 (major flag; manual review) |
| `sharp` | high | next 16.4.1 (same-major proposal) |
| `source-map-js` | high | compatible resolution available (review) |
| `tinypool` | critical | compatible resolution available (review) |
| `valibot` | moderate | prisma 6.19.3 (major flag; manual review) |
| `vite` | high | compatible resolution available (review) |
| `vitest` | critical | compatible resolution available (review) |
| `ws` | high | compatible resolution available (review) |

The JSON artifact contains advisory URLs, vulnerable ranges, dependency paths and exact fix suggestions for each table entry. No audit fix command or blind upgrade was run.

## Residuals / owner decisions
- Dependency findings require a separately approved remediation effort; this consolidation does not claim security clearance or deployment readiness.
- Immutable final storage and ambiguous/orphan objects grow without bounds; superseded-final retention is intentionally indefinite. No cleanup policy authorized here.
- Concept request receipts require clients to retry the same request key for outcome recovery. Final exact-row verification cannot eliminate the narrow late-commit/provider race.
- Notification markers are asset-scoped; email remains at least once and legacy markers can permit duplicates. No exactly-once claim.
- Existing signed URLs can remain valid for roughly an hour. Process-local limiting is not globally coordinated.
- Real database serializable/provider concurrency, production credentials, live email/payment/storage behavior, and mounted authenticated admin E2E were not exercised. No migrations or live operations performed.
- Merge/push to main, dependency changes and deployment remain the owner's decisions.
