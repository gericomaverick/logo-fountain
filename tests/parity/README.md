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

## Test infrastructure (`infra/`, story 0.2)

```bash
npm run infra:up      # postgres, mailpit, seaweedfs, postmark-shim, stripe-fake (waits until healthy)
npm run infra:probe   # DB bootstrap, S3 conditional-PUT probe, postmark-shim -> Mailpit, stripe-fake selftest
npm run infra:down    # removes containers and volumes
```

All credentials are **test-only** throwaway values defined in `infra/docker-compose.test.yml`. Host ports (override with the `PARITY_*_PORT` variables):

| Service | Host endpoint | Use |
|---|---|---|
| postgres 18.7 | `127.0.0.1:55432`, db `lf_parity` | roles `lf_migrate` (owner of the db, `public`, `parity`) and `lf_runtime` (connect only; grants come from the app's grant script). Marker table `parity.parity_marker` |
| Mailpit v1.33.0 | SMTP `127.0.0.1:51025`, UI/API `http://127.0.0.1:58025` | Laravel SMTP; target of postmark-shim |
| SeaweedFS 4.51 | S3 `http://127.0.0.1:58333` (path-style, signed) | buckets `lf-parity-concepts`, `lf-parity-final-deliverables` (`PARITY_S3_*_BUCKET`) |
| postmark-shim | `http://127.0.0.1:58090/email` | Postmark `POST /email` -> Mailpit. `POST /__fail {"count":N}` fails the next N sends with 500 |
| stripe-fake | `http://127.0.0.1:58091` | Stripe API subset + hosted page `/pay/:id`. Webhooks go to `STRIPE_FAKE_WEBHOOK_URL` (default `http://host.docker.internal:4310/api/stripe/webhook`), signed with `whsec_parity_test_only_0000000000000000`. Admin: `POST /__fixtures/load`, `/__webhook/:sessionId`, `/__config`, `/__reset`; `GET /__deliveries`, `/__state` |

Stripe fixtures live in `fixtures/stripe/` (`prices.json` plus one paid package session per tier; all load at startup).

### Running Next.js on the stack

```bash
M=postgresql://lf_migrate:parity-test-only-migrate@127.0.0.1:55432/lf_parity
R=postgresql://lf_runtime:parity-test-only-runtime@127.0.0.1:55432/lf_parity
cd ../../apps/web
env -i PATH="$PATH" HOME="$HOME" PARITY_MODE=1 PARITY_DATABASE_URL=$M PARITY_RUNTIME_DATABASE_URL=$R node scripts/parity-migrate.mjs
```

Start `next dev` with `env -i` (so `.env.local` isn't inherited, and without `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`/`AI_AGENT`, which make Next 16.4 refuse to start): `PARITY_MODE=1 DATABASE_URL=$R DIRECT_URL=$M BETTER_AUTH_SECRET=<32+ chars> PUBLIC_SITE_URL=<base url> STRIPE_SECRET_KEY=sk_test_parity STRIPE_API_BASE=http://127.0.0.1:58091 STRIPE_WEBHOOK_SECRET=whsec_parity_test_only_0000000000000000 POSTMARK_SERVER_TOKEN=parity POSTMARK_FROM=portal@parity.test POSTMARK_API_URL=http://127.0.0.1:58090/email R2_ACCOUNT_ID=0123456789abcdef0123456789abcdef R2_ACCESS_KEY_ID=parity-test-only-access-key R2_SECRET_ACCESS_KEY=parity-test-only-secret-key R2_CONCEPTS_BUCKET=lf-parity-concepts R2_FINAL_DELIVERABLES_BUCKET=lf-parity-final-deliverables R2_ENDPOINT=http://127.0.0.1:58333 ADMIN_NOTIFICATION_EMAILS=admin@parity.test`. The suite itself needs `PARITY_TARGET`, `PARITY_BASE_URL`, `PARITY_DATABASE_URL=$M` and the same `R2_*` variables (so seeding uploads objects).
