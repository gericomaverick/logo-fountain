# Parity suite

One black-box test suite that runs against **either** the current Next.js app (`apps/web`) or the new Laravel app (`apps/portal`). The Next.js app is the specification. Rules and layers are in `docs/laravel-migration/02-test-strategy.md`.

```bash
npm ci && npx playwright install chromium
npm run check                                   # structure rules (imports, titles, expected-failure list)
npm run selftest                                # proves the expected-failure mechanism
PARITY_TARGET=next PARITY_START_NEXT=1 node scripts/run.mjs "@smoke"   # run a gate against Next
PARITY_TARGET=laravel PARITY_BASE_URL=http://127.0.0.1:8000 node scripts/run.mjs "@auth&@api"
```

| Path | Purpose |
|---|---|
| `journeys/` | Shared tests. Never branch on the target |
| `pages/` | Page objects: `index.ts` (interfaces and resolver), `next/`, `laravel/` |
| `adapters/` | `target.ts` (target and URL), `seed.ts` (load a scenario into the target, deterministic IDs), `api.ts` (cookie-isolated clients that sign in through the real login) |
| `fixtures.ts` | `test`/`expect` with the `target` fixture and expected-failure marking |
| `fixtures/rules/*.json` | Shared rule fixtures (story 0.6b). Generated from Next: `CAPTURE=1 npx vitest run src/lib/__tests__/shared-rule-fixtures.test.ts` in `apps/web`; Next's `npm run test` asserts them; the PHP ports must agree case-for-case |
| `expected-next-failures.txt` | Exact titles of `@deviation` tests that must fail on Next |
| `converted-tags.txt` | Gate expressions that are green on Laravel (run by CI) |

**Titles** start with inventory IDs and end with tags: `A-15 root sends an anonymous visitor to sign-in @smoke @ui`. Layer tags: `@unit`, `@api`, `@ui`, `@pg-race`, `@visual`. Gates combine tags with `&` (and) and `|` (or).

## Local stack for API tests (until story 0.2's compose is merged)

Contract tests need the target running on a seeded DB. Required env: `PARITY_TARGET`, `PARITY_BASE_URL`, `PARITY_DATABASE_URL` (migrate/owner role URL to `lf_parity`). For Next, start `next dev` in `apps/web` with `PARITY_MODE=1`, `DATABASE_URL` (runtime role), `DIRECT_URL`, `BETTER_AUTH_SECRET`, `PUBLIC_SITE_URL=<base url>`, `STRIPE_SECRET_KEY=sk_test_placeholder`, and **without** `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`/`AI_AGENT` (Next 16.4 refuses to start under an agent). Use `env -i` so `.env.local` values aren't inherited. See `docs/laravel-migration/stories/0-4-seed-scenarios-next.md` for a working recipe.
