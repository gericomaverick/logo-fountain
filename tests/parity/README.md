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
| `adapters/` | Target resolution (later: seed, mail, storage, Stripe adapters) |
| `fixtures.ts` | `test`/`expect` with the `target` fixture and expected-failure marking |
| `expected-next-failures.txt` | Exact titles of `@deviation` tests that must fail on Next |
| `converted-tags.txt` | Gate expressions that are green on Laravel (run by CI) |

**Titles** start with inventory IDs and end with tags: `A-15 root sends an anonymous visitor to sign-in @smoke @ui`. Layer tags: `@unit`, `@api`, `@ui`, `@pg-race`, `@visual`. Gates combine tags with `&` (and) and `|` (or).
