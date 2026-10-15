# Dependency vulnerability remediation — 5230

## Summary
- Scoped child branch of `af402fc84f79211d0b0567dfa9746b0ff8bda125`; runtime Next/React/Prisma updated, reviewed Vitest tooling major completed.
- Web audit: **39 → 9 affected package nodes; 3 → 0 critical, 26 → 9 high, 8 → 0 moderate, 2 → 0 low**. **Not audit-clean.**
- Omit-dev audit: **22 → 4 high-only nodes**; production classification includes the Prisma CLI, not just request-serving code.
- Clean install and complete dependency tree pass; 557 unit tests, typecheck, lint, webpack build (31 pages), and 6 owned-port Chromium tests pass.
- Remaining high findings are three upstream roots: Braces (lint), DeepmergeTS (Prisma configuration), MySQL2 (Prisma tooling; app uses PostgreSQL).
- Independent marketing lock remains unchanged at **17 findings**, including 1 critical; marketing remediation needs a separate scoped task.
- No source/security behavior changes, live services, migrations, deployment, primary-worktree edits, main merge or push. Decide ownership/timing for upstream follow-up and marketing remediation.

## Scope and evidence

Read `docs/TODO.md`, `apps/web/docs/test-runbook.md`, the consolidation report and image follow-up report before changing dependencies. Created `workbench/dependency-remediation-5230` from the consolidated/image HEAD. The pre-install decision record was committed as `bf237f9` before the reviewed Vitest major. The preserved consolidated branch remains at `af402fc84f79211d0b0567dfa9746b0ff8bda125`; original emergency branch remains at `bfaac3293f84a3259c730e0e3e23aaba6e87ea6e`.

There is **no root workspace or shared lockfile**. `apps/web/package-lock.json` and `apps/site/package-lock.json` are independent v3 locks. Only the web manifest/lock and this documentation changed. Site manifest/lock SHA-256 checks match the baseline. The primary worktree's tracked binary diff and untracked-file list match the saved baseline; its existing dirty work was not edited.

Environment: Node **24.22.0**, npm **11.19.1**, Linux x64 glibc. Full raw evidence is copied to:

`/home/openclaw/.openclaw/workspace/projects/workbench/data/logo-fountain/reports/dependency-remediation-5230-artifacts/`

Key artifacts: `web-before.json`, `web-prod-before.json`, `web-after.json`, `web-prod-after.json`, `site-before.json`, `site-after.json`, `advisory-triage.tsv`, `lock-delta.json`, `residual-paths.json`, `npm-ci-final.log`, `npm-ls-final.json`, `validation-summary.log`, and individual final validation logs. The companion [`dependency-remediation-5230-advisories.tsv`](dependency-remediation-5230-advisories.tsv) lists every original source advisory record, affected range, URL, status and applicability category. Raw audit totals count affected package nodes, **not distinct exploitable defects**: the original web audit contains 140 source advisory records / 130 unique URLs, plus propagated metavulnerabilities. The final nine high package nodes represent **four source advisories in three libraries: three high advisories and one moderate MySQL2 advisory**. npm classifies MySQL2 at its highest severity, so the zero moderate-node count does not mean every moderate source advisory was eliminated.

## Audit comparison

Commands, run from the relevant application directory:

```sh
npm audit --ignore-scripts --package-lock-only --json
npm audit --ignore-scripts --package-lock-only --omit=dev --json
```

`--ignore-scripts` is used only for read-only audit commands, **not installs or validation**. Audit exits nonzero when findings exist; those exits are expected and the JSON is preserved.

| Lock / dependency scope | Before critical / high / moderate / low | Before total | After critical / high / moderate / low | After total |
| --- | --- | ---: | --- | ---: |
| Web, all | 3 / 26 / 8 / 2 | 39 | 0 / 9 / 0 / 0 | 9 |
| Web, omit dev | 1 / 15 / 6 / 0 | 22 | 0 / 4 / 0 / 0 | 4 |
| Site, all (audit only) | 1 / 13 / 3 / 0 | 17 | 1 / 13 / 3 / 0 | 17 |

## Exact direct dependency decisions

| Package | Baseline resolved / declaration | Final exact declaration | Reason |
| --- | --- | --- | --- |
| `next` | 16.1.6 | **16.4.1** | Patched stable Next 16; fixes critical and high runtime advisories without framework major migration. |
| `react`, `react-dom` | 19.2.3 | **19.2.9**, paired | Compatible React 19.2 patches; keep server/client pair synchronized. |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg` | 7.4.2 / ^7.4.2 | **7.10.0**, all three | Stable Prisma 7 line and matching generated client/adapter, not Prisma 8 prerelease or audit-suggested Prisma 6 downgrade. |
| `vitest` | 3.2.4 / ^3.2.4 | **4.1.11** | Explicitly reviewed tooling major: fixes mocker/UI advisory and removes affected Tinypool dependency. |
| `vite` | Transitive 7.3.1 | **7.3.7**, new dev declaration | Explicit compatible Vitest peer on existing Vite 7 major; prevent unnecessary Vite 8/Rolldown migration and optional native-package conflict. |
| `eslint-config-next` | 16.1.6 | **16.1.6**, retained | Updating to 16.4.1 does not fix the remaining vulnerable chain; retain compatible Next-16 lint tooling rather than refactor unrelated UI. |
| `eslint-plugin-react-hooks` | Transitive 7.0.1 | **7.0.1**, new dev declaration | Within config's ^7.0.0 requirement; no audit advisory. Preserve known-good existing rule implementation rather than accept unrelated diagnostic drift. |

All other direct declarations are unchanged. npm reordered `@playwright/test` in the manifest but did not change its declared range. No `overrides`, forced peer resolutions, security-rule disabling, framework major migration, `npm audit fix`, or lock deletion was used.

### Why Vitest 4 was necessary

The reviewed Vitest 3 patch line still uses `tinypool ^1.1.1`, affected by critical prototype-pollution-to-RCE advisories. Vitest/mocker versions before 4.1.11 also retain an arbitrary-file-read advisory. Vitest 4.1.11 removes Tinypool and fixes mocker. The configuration is Node-only, with no browser/coverage plugin integration to migrate. Installed Node satisfies the reviewed engines; the complete 88-file/557-test suite passed unchanged. This was the only intentional direct dependency major upgrade.

### Compatible transitive updates and integrity

After the direct updates, ran:

```sh
npm update @humanfs/node brace-expansion flatted js-yaml picomatch ws
```

Notable final resolved changes (the exact full path-level delta, including added/removed optional platform packages, is in `lock-delta.json`; the repository lock diff is authoritative):

| Package | Before → after |
| --- | --- |
| `@humanfs/node` | 0.16.7 → 0.16.8 |
| `brace-expansion` | 1.1.12 → 1.1.21; 5.0.4 → 5.0.12 |
| `flatted` | 3.3.4 → 3.4.4 |
| `js-yaml` | 4.1.1 → 4.3.2 |
| `picomatch` | 2.3.1 → 2.3.2; 4.0.3 → 4.0.7 |
| `ws` | 8.19.0 → 8.22.0 |
| `@vitest/mocker` | 3.2.4 → 4.1.11 |
| `tinypool` | 1.1.1 → removed |
| `esbuild` | 0.27.3 → 0.28.2 (Vite's supported dependency) |
| `sharp` | 0.34.5 → 0.35.5 (Next's supported dependency) |
| `postcss` | 8.4.31 / 8.5.6 → 8.5.23 |
| `baseline-browser-mapping` | 2.10.0 → 2.11.28 |
| `browserslist` | 4.28.1 → 4.29.3 |
| `defu` | 6.1.4 → 6.1.7 |
| `nanoid` | 3.3.11 → 3.3.20 |
| `source-map-js` | 1.2.1 → 1.2.2 |
| `effect` | 3.18.4 → 3.20.0 |

Supported internal major changes accompanying Vitest/Prisma upgrades include Chai 5.3.3 → 6.3.0, Chokidar 4.0.3 → 5.0.0, Readdirp 4.1.2 → 5.1.1, es-module-lexer 1.7.0 → 2.3.2, Giget 2.0.0 → 3.3.1, perfect-debounce 1.0.0 → 2.1.0, rc9 2.1.2 → 3.1.0 and tinyrainbow 2.0.0 → 3.2.0, alongside paired Vitest internals. These are parent-supported dependency choices, not independent framework migrations or overrides; `internal-major-paths.json` records the resolved chains, and unchanged app tests/types/lint/build validate compatibility on Node 24.

The full delta comprises **272 changed/added/removed versioned lock nodes**, not 272 manually selected direct upgrades. Many are paired framework binaries, Prisma internals, Vitest components and optional native targets. Every final non-root lock node has `resolved` and `integrity`, and every resolved URL uses `https://registry.npmjs.org/`. Clean `npm ci --foreground-scripts` succeeds with 549 packages added; `npm ls --all --json` exits **0**, with no invalid/missing dependency or peer errors on this platform. The local web `node_modules` is an actual isolated install, not a shared-primary symlink.

The initial unconstrained Vitest peer selected Vite 8.3.4, introducing Rolldown and two Lightning CSS versions; `npm ls --all` then flagged cross-libc optional fallback between Tailwind's 1.31.1 and Vite's 1.33.0. Supported explicit Vite 7.3.7 resolved this without an override or unnecessary bundler major. Final integrity check passes in full, not just `--omit=optional`.

npm's advisory `allowScripts` warnings do not mean scripts were skipped: final foreground logs show Prisma preinstall, Prisma engines postinstall, esbuild postinstall and native resolver postinstall executing. `ignore-scripts=false`, strict script enforcement is not enabled, and no checks were disabled. A preliminary package-specific approval command with `--dry-run` unexpectedly wrote `allowScripts`; that transient manifest addition was removed. The **final manifest contains no script-policy change**, and a subsequent clean install and complete validation passed with the original policy.

### Lint compatibility trial

A trial of config 16.4.1 and transitive hooks 7.1.1 introduced five `set-state-in-effect` errors across four existing UI screens, but did not reduce the vulnerable lint chain. Retaining config alone was insufficient because its range also admits hooks 7.1.1. The final exact hooks 7.0.1 declaration preserves the baseline rule implementation within the supported ^7.0.0 range. No rule was turned off or security check weakened; all existing lint checks run and pass. Next does not require identical minor versions of its ESLint config. Future adoption of the newer hooks diagnostics is separate UI maintenance, not a claimed security fix.

## Applicability and remediation assessment

### Original critical advisories — removed

- **Next runtime, GHSA-p293-qw3h-jr36:** unauthenticated RCE on Windows-hosted servers. This validation host is Linux; the production hosting platform was not established, so the finding was not dismissed. Next 16.4.1 is outside the affected `<16.3.3` range.
- **Next runtime, GHSA-2xp9-vwfh-vxw4:** unauthenticated RCE in image optimization when AVIF files are used. The app uses `next/image`, making optimizer exposure worth prioritizing; actual deployment AVIF inputs were not demonstrated. Fixed by the Next update, with Sharp refreshed through its supported dependency.
- **Tinypool, GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr:** prototype pollution gadgets in worker/run options can lead to RCE. Test/CI process exposure, not a demonstrated unauthenticated app route. Tinypool is absent from the final lock.
- **Vitest, GHSA-5xrq-8626-4rwp:** arbitrary file read/execution when its UI server is listening. App config is Node-only, no UI server was launched; still fixed by upgrading, not waived on configuration alone.

### Other resolved advisory families

- **Next App Router / server-component / image / request handling:** production dependency and public request boundary; multiple high DoS, bypass and SSRF advisories plus moderate/low CSRF/cache/XSS/information findings. The app uses App Router and image optimization. Some advisories require features such as rewrites, custom servers, Pages Router i18n, Cache Components or Server Actions; this task did not prove all such preconditions. All original Next advisory ranges are excluded by 16.4.1. Application authorization/origin/redirect safeguards and image configuration were not changed or treated as substitutes for patching.
- **Prisma's internal dev/config tooling:** Hono/node-server, AST/parser/Chevrotain/Valibot, Effect and associated helper findings are supplied by CLI/config/dev-server chains. The production manifest includes Prisma CLI, which explains many omit-dev audit results. Application routes use the generated Prisma client and PostgreSQL adapter; no Hono/Prisma development server is served by application source. Package updates removed these findings, but live DB generation/query behavior was not exercised.
- **Vitest/Vite/esbuild/mocker:** testing/development servers, worker/process and file-system boundaries, not application request routing. No dev/UI server was intentionally exposed externally; Vite stays on patched major 7 and mocker is 4.1.11.
- **ESLint/build glob, parser, serialization and filesystem dependencies:** HumanFS, brace-expansion, picomatch, flatted, js-yaml, Babel, Browserslist and Baseline findings depend on crafted paths, patterns, inputs or repository/build state. These remain relevant in CI or untrusted branch workflows; compatible patched versions resolved their original advisories. **`brace-expansion` is distinct from the still-affected `braces` package.**
- **Shared/runtime helpers:** Sharp is relevant to server image processing; PostCSS/source maps mainly to processing/build tooling; WS and general helper findings depend on the calling dependency and hostile-input path. Do not equate presence in the omit-dev closure with proven public exploitability. Their original audit findings are no longer present after the reviewed updates. Exact source advisory titles/ranges and status are recorded in the TSV; no source advisory was hidden via an audit exclusion.

### Remaining high findings — three roots, nine package nodes

| Advisory root | Final chain / version | Applicability | Fix availability and decision |
| --- | --- | --- | --- |
| **Braces — [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)** | `eslint-config-next@16.1.6` → `@next/eslint-plugin-next@16.1.6` → pinned `fast-glob@3.3.1` → `micromatch` → `braces@3.0.3` | Stack exhaustion with nested patterns. Lint/build tooling; no public app route found passing user glob patterns. Affects tooling trust boundary, not universally safe. | Registry latest Braces is still 3.0.3 and affected (`<=3.0.3`). Latest tested Next lint config retains this chain. Await upstream release/chain change; do not force an unrelated downgrade or unreviewed override. |
| **DeepmergeTS — [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)** | `prisma@7.10.0` → `@prisma/config@7.10.0` → exact `deepmerge-ts@7.1.5` | Stack exhaustion on recursive graphs. Configuration/tooling path, not a discovered user-controlled app merge operation. Prisma config is repository-owned. | Fix starts at 8.0.0; Prisma stable 7.10.0 pins 7.1.5. A blind 7→8 override bypasses upstream support. Keep aligned stable Prisma packages and track upstream adoption. |
| **MySQL2 — [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) (high), [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) (moderate)** | `prisma@7.10.0` → exact `mysql2@3.15.3` | Malicious server authentication-plugin downgrade can leak plaintext credentials; unbounded inflate in compressed protocol handling also permits decompression-bomb DoS. App schema and runtime adapter are PostgreSQL; no application MySQL2 import or MySQL connection path found. CLI inventory still includes it. | Credential issue affects `<3.22.0`; decompression issue affects `<=3.23.0`. Fixed releases exist (registry latest 3.24.6), but Prisma pins this exact old version. No direct addition/override or Prisma downgrade solely to manipulate the audit. Reassess before any MySQL use and when stable Prisma updates its pin. |

The **nine** flagged nodes are `braces`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`, `deepmerge-ts`, `@prisma/config`, `mysql2`, and `prisma`. The latter omit-dev closure contains **four**: DeepmergeTS, Prisma config, MySQL2 and Prisma. These are not nine independent attack vectors. npm's suggested Prisma 6.19.3 / eslint-config-next 14.2.35 changes are unsuitable major-line downgrades, not approved remediations.

Follow-up ownership: monitor stable Prisma and Next lint/Braces releases; re-audit and validate after upstream-supported dependency changes. Keep config/dev servers private and repository configuration trusted; do not introduce MySQL usage without revisiting the MySQL2 advisory. These are recommendations, not deployment controls verified or newly applied by this task.

### Marketing boundary

The independent site remains **1 critical / 13 high / 3 moderate**. Its raw before/after audits are preserved; source advisory identifiers remain in those reports. The critical node is `shell-quote@1.8.4`, pinned by `concurrently`: [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) describes command injection with crafted comment/line-terminator tokens (fixed at 1.11.0); [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv) describes quadratic parsing DoS. This is a development command orchestration trust boundary, not an established public site request path; exploit reproduction was not performed. Other findings concern Eleventy's template/Markdown/YAML, image processing and file-watcher/build chains, whose exposure depends on untrusted content/assets or development-server access. Audit suggests compatible changes for some tools, an Eleventy-image 7 major for some image findings, and an inappropriate Eleventy 0.6.0 downgrade for others; a separately reviewed site plan must validate these rather than blindly follow it. No site installs, lockfile refresh, content or runtime edits were made. It does not consume the web lock, so web remediation does not remediate marketing. Do not interpret the web zero-critical result as a repository-wide zero-critical result. Marketing-specific reachability, upgrades and functional validation remain out of scope and require their own task.

## Validation and reproduction

The documented shared queue command was attempted, but `/home/openclaw/.openclaw/workspace/projects/workbench/scripts/test-queue.mjs` is absent (`MODULE_NOT_FOUND`, evidence in `queue-status.log`). Checks ran **directly and sequentially**, not as invented successful queue jobs. No competing Vitest/Next/Playwright process was observed before the final batch. Final batch order after clean install: generate client, full units, typecheck, lint, webpack build, owned-port E2E. No checks overlapped.

| Check | Actual final result |
| --- | --- |
| `npm ci --foreground-scripts` | Pass; install scripts execute, integrity checks enabled. |
| `npm ls --all --json` | Pass, exit 0. |
| Placeholder `DATABASE_URL=... npx prisma generate` | Pass; client 7.10.0, no migration or DB connection. |
| `npm run test` | **88 files / 557 tests pass** on Vitest 4.1.11. Existing security/lifecycle regressions exercised; no source changes required new behavior-specific tests. |
| `npm run typecheck` | Pass. |
| `npm run lint` | Pass, **0 errors / 0 warnings**. |
| `npm run build -- --webpack` | Pass; **31 pages**, placeholder-only environment. |
| `CI=true npm run test:e2e -- --config=playwright.dependencies-5230.config.ts` | **6/6 Chromium tests pass**, one worker, owned 127.0.0.1:45230, no server reuse. Port checked free before and released afterward. Temporary config removed and copied to artifacts for reproduction. |
| Read-only audits / site hash checks / primary baseline comparisons | Pass as checks; audit findings remain explicitly recorded above. |
| `git diff --check` | Pass. |

An initial unit run accidentally inherited the build-only `PUBLIC_SITE_URL=https://example.com`, causing 102 expected canonical-origin rejections in tests using localhost. Rerunning in the ordinary test environment passed all 557 without weakening origin checks or changing tests. An initial typecheck read stale `.next` generated types from the previous Next version; `next typegen` alone did not remove all obsolete files. Moved that ignored build directory outside the worktree and rebuilt; final generated types, typecheck and build pass. These failed exploratory logs are retained, not presented as successes.

Reproduction from `apps/web` (do not export build-only environment before units):

```sh
npm ci --foreground-scripts
npm ls --all
DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder npx prisma generate
npm run test
npm run typecheck
npm run lint
# Set placeholders below only for build and the owned local E2E server.
npm run build -- --webpack
```

Build placeholders used:

```sh
DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=placeholder
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
POSTMARK_SERVER_TOKEN=placeholder
POSTMARK_FROM=noreply@example.com
PUBLIC_SITE_URL=https://example.com
ADMIN_EMAILS=admin@example.com
```

For E2E, copy the saved `playwright.dependencies-5230.config.ts` artifact into `apps/web`, check port 45230 is free, set `PUBLIC_SITE_URL=http://127.0.0.1:45230`, then run the command in the table and remove the config. It imports the checked-in config, changes base URL and server command to webpack on port 45230, sets one worker/no retries and `reuseExistingServer:false`. Browser execution emits non-failing Next image LCP/loading suggestions on randomized auth artwork. Image policy changes are outside this dependency task; the previous image-efficiency work remains unchanged.

## Not checked or changed

No live database queries, real PostgreSQL concurrency/race integration, migrations, live auth/storage/payment/email providers, deployment-host exploit reproduction, authenticated admin browser workflows, marketing functionality/build, or other OS/native-package installations were exercised. No application routes, authorization, upload/lifecycle protections, private signed-image paths, database schema, Next image/security-header configuration or provider settings were changed. All application behavior claims are limited to the checks actually run above.
