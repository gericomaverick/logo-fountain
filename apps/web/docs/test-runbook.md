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
