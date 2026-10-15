# Test runbook

## Install deps

```bash
npm install
npx playwright install chromium
```

## Local validation

Run these from `apps/web`:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## Notes

- `lint` currently has warnings only (no failing errors).
- `test:e2e` starts Next dev server on `127.0.0.1:4173` via Playwright config.
- `npm run build` needs placeholder `STRIPE_SECRET_KEY` (any non-empty value). Do not export a build-time `PUBLIC_SITE_URL` into the unit-test shell: origin tests set their own.

## Real PostgreSQL and authenticated golden path (opt-in)

`npm run test` skips the real-database suites. To run them, provide user-local PostgreSQL binaries (no Docker, no system service, never a shared or live database):

```bash
POSTGRES_TEST_BIN=/path/to/pg/bin POSTGRES_TEST_SHARE=/path/to/pg/share/postgresql \
POSTGRES_TEST_LIB=/path/to/pg/lib PG_TEST_ARTIFACT_DIR=/tmp/lf-pg-evidence \
PG_GOLDEN_PATH=1 npm run test:postgres
```

The runner creates its own throwaway cluster with distinct runtime/migration roles, applies the migrations and `ops/postgres/runtime-grants.sql`, checks zero schema drift, then runs `src/lib/postgres.integration.test.ts` and `src/lib/auth.postgres.integration.test.ts`. It refuses a `.env.local` and runs nothing as root. With `PG_GOLDEN_PATH=1` it also starts its own `next dev` on a random loopback port, with runtime-only DB credentials and no mail transport. It then runs `e2e-golden/` (`playwright.golden.config.ts`) using single-use links that the test process captured, and stops the server and cluster afterwards. Logs in the artifact directory have passwords and secrets redacted.

## Security critic follow-up validation

Affected tests only (run through the shared validation queue, not alongside another team's run):

```bash
npm run test -- src/lib/request-origin.test.ts src/lib/auth/safe-next.test.ts src/lib/auth/logout.test.ts src/components/header-nav.test.ts src/app/api/auth/logout/route.test.ts src/app/api/auth/forgot-password/route.test.ts src/app/api/route-guards.test.ts
npm run typecheck
npm run lint
```

Result: 167 tests passed in 7 files; typecheck passed; lint had 0 errors and 2 existing warnings. No build, full-suite, browser, live-provider, or edge checks were run for this follow-up. See `security-boundaries.md` for required pre-release verification and the manual-console-only CSP observation contract.

## Owner-approved final session verification fix

From `apps/web`, through the shared queue:

```bash
npm run test -- src/app/api/auth/session/route.test.ts src/lib/auth/logout.test.ts
npm run typecheck
```

Result: 15 tests passed in 2 files; typecheck passed. No other tests, lint, build, browser, provider, or live operations were run for this final fix.
