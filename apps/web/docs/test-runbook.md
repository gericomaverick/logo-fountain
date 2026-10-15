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
