# Owner-run persistent local PostgreSQL and manual app testing (5649)

**Not automatically created or seeded.** This is separate from `npm run test:postgres`, which creates and deletes its *own* ephemeral cluster. Nothing here connects to Supabase or an existing `DATABASE_URL`. From `apps/web` in a clean isolated checkout of the handoff branch (never the dirty primary checkout), use user-local PostgreSQL binaries with `initdb`/`pg_ctl` and compatible share/lib directories, Node and installed project dependencies. Do not run as root. Ensure no app `.env`, `.env.local`, `.env.development*`, `.env.test*` or `.env.production*` files exist in `apps/web`: this helper refuses them because Next/Prisma can auto-load them even when the process environment is sanitized. Use only the private out-of-repo files described below. Reserve ports `127.0.0.1:45232` (database) and `127.0.0.1:45231` (app); do not expose them to a LAN. Never point Prisma at a live database or copy these files into production.

## Create, keep, and restart your *manual-testing* DB

The **named persistent data directory** is `~/.local/share/logo-fountain/dev-pg-5649/` (`data/` is the actual PG cluster). It contains mode-0600 private configuration, a marker and later the account handoff file. The directory is private (0700). `init` refuses ANY existing directory, generates independent cryptographically random owner/migration/runtime passwords and an auth secret without printing them, initializes and starts a loopback-only plain PostgreSQL cluster, creates distinct `cluster_owner`, `lf_migration`, and DML-only `lf_runtime` roles and an empty `lf_local_dev` database. It does **not** migrate/seed or modify other databases. A private ownership marker is written before cluster initialization; if init fails, `stop` can stop only a running cluster with a matching marker and verified data-directory PID file, even if config creation failed. After inspecting a failed partial directory, `reset` requires explicit confirmation and a stopped/no-uncertain-PID cluster; it never auto-wipes manual data. An unmarked directory is deliberately refused and needs manual owner investigation. Use the **same paths** on later commands; local binaries must be PG-compatible with the created cluster.

```bash
cd apps/web
export POSTGRES_TEST_BIN=/path/to/user-local/pg/bin
export POSTGRES_TEST_SHARE=/path/to/user-local/pg/share/postgresql
export POSTGRES_TEST_LIB=/path/to/user-local/pg/lib # if that distribution needs it
node scripts/local-dev-pg.mjs init
# After reboot or stop:
node scripts/local-dev-pg.mjs start
```

Only **after** you have inspected the named directory, confirmed it is your newly allocated, disposable local cluster, and explicitly authorized the owner-provided admin/customer emails **in that local DB only**, create a PRIVATE local configuration file. Enter the two addresses privately in your editor as JSON string fields `{"adminEmail":"<owner-provided-admin>","customerEmail":"<owner-provided-customer>"}` (replace placeholders; lower-case; different addresses). Do not use `echo`, shell arguments, Git, chat, screenshots or terminal output for the actual addresses. The file must be mode 0600; the noclobber command refuses an existing file:

```bash
( umask 077; set -C; : > "$HOME/.local/share/logo-fountain/dev-pg-5649/local-identities.json" )
${EDITOR:-vi} "$HOME/.local/share/logo-fountain/dev-pg-5649/local-identities.json"
chmod 600 "$HOME/.local/share/logo-fountain/dev-pg-5649/local-identities.json"
node -e 'const fs=require("node:fs"); const f=process.env.HOME+"/.local/share/logo-fountain/dev-pg-5649/local-identities.json"; const x=JSON.parse(fs.readFileSync(f)); if(!x.adminEmail||!x.customerEmail||x.adminEmail===x.customerEmail) process.exit(1); console.log("Private identity file structure OK (values suppressed)")'
```

Then explicitly run:

```bash
node scripts/local-dev-pg.mjs seed
# Separate terminal, same checkout and PG binary env; foreground Next dev:
node scripts/local-dev-pg.mjs app
# Open the printed loopback login URL; Next output is suppressed to protect tokens; the helper refuses an occupied app port and stops its Next process group on SIGINT/SIGTERM.
# If it fails to start, check port availability and local installation; don't enable verbose request logs.
# To use your OWN PRIVATE TEST R2 buckets after following private-r2-runbook.md:
node scripts/local-dev-pg.mjs app --with-r2
```

`seed` checks the running private-socket cluster's actual `data_directory`, loopback listening address/port and ownership marker before deploying Prisma migrations and runtime grants with helper-constructed URLs. The opt-in fixture independently compares **all three** of `DATABASE_URL`, `DIRECT_URL` and `PG_INTEGRATION_URL` to its private config and verifies the running cluster via its private Unix socket **before** any fixture writes, mocked mailbox proof or admin bootstrap. It refuses a previously written handoff file. It runs the existing *trusted paid-session fulfillment and access-provisioning* fixture with mocked Stripe price lookup: one Essential project, paid **test** order, two entitlements and customer membership. Payment is synthetic; there is **no real charge or Stripe webhook**. It prepares the locally configured admin address as an initially unverified, non-admin identity, consumes a one-time mocked-mail setup proof to set a random high-entropy local password and verify it, then calls **only** the existing one-time migration-owner `bootstrap-admin.mjs` to grant admin. This is NOT an admin creation API or a runtime-role promotion. It provisions the locally configured customer address as a non-admin paid customer and captures a one-hour, single-use setup link via in-process mocked mail. Neither address receives an email. No Postmark token is passed; no email is sent. **Admin mailbox verification here is a synthetic local proof through the test-process mail mock; it does not establish real-world ownership of the mailbox and must never be copied to production.** If seed fails halfway, **stop** and inspect locally; do not blindly retry/erase data; bootstrap may already be consumed. An incomplete (0600) credential file preserves the generated admin password before bootstrap, but is NOT evidence that login or customer setup succeeded. Seek owner approval before resetting.

Private credentials and setup link are written **only** to `~/.local/share/logo-fountain/dev-pg-5649/local-credentials.json` (0600). Open it in a private local editor or password manager, never paste its values into chat, a shell argument, a report, Git, screenshots or terminal/log output. Keep browser history/network captures private; the customer link contains a bearer fragment. The admin password is generated separately; it is **not** the customer password or link. At `http://127.0.0.1:45231/login` sign in as the `admin.email` in that private file using the local admin password in the file; in a separate browser profile open the `customer.setupLink` in the private file, choose a new unique customer password at `http://127.0.0.1:45231/set-password`, then sign in as `customer.email` in that private file at `/login`. Project is at `http://127.0.0.1:45231/project/<customer.projectId>` (the ID is in that private file). Proofs expire in one hour and are single-use; with mail disabled, expired setup requires a separately approved local operator recovery procedure, not a public password-reset request.

```bash
node scripts/local-dev-pg.mjs stop       # stops only this marked cluster; PRESERVES all data and secrets
node scripts/local-dev-pg.mjs start      # returns to same DB and accounts
# DANGEROUS: only if YOU have identified this exact marked directory as disposable,
# no app process is using it, and you intend to discard all local PG + account data:
node scripts/local-dev-pg.mjs stop
node scripts/local-dev-pg.mjs reset --confirm-disposable-local-data
```

`reset` requires both the ownership marker/private directory and explicit flag, refuses a running or uncertain cluster and deletes **only** the named directory. It does not delete R2 bytes. Never run reset to resolve uncertainty about a target. `init` after reset creates *new* local accounts only if you then explicitly run `seed` again. Do not back up/share the credentials file without an owner-approved secure process.

## Stripe test-mode purchases (`--with-stripe`)

`app --with-stripe` reads `stripe-test.json` inside the private local directory (mode 0600, edited locally, never pasted anywhere) with two JSON string fields: `STRIPE_SECRET_KEY` (a **test-mode** `sk_test_`/`rk_test_` key; live keys are refused) and `STRIPE_WEBHOOK_SECRET` (the `whsec_` secret that `stripe listen` prints). In a separate terminal run `stripe listen --forward-to 127.0.0.1:45231/api/stripe/webhook`; its secret stays the same between runs for the same CLI login, so the file rarely changes. Prices come from `src/lib/stripe-price-allowlist.ts` and must exist in the same Stripe account's test mode. Postmark stays off, so pay with the seeded customer's email: the order attaches to that existing account, which signs in with its password. A new purchaser address gets no setup email locally. Combine with `--with-r2` for uploads. Use Stripe's test cards only.

## Boundaries for provider-complete E2E

Default `app` receives **only runtime PG credentials**, a generated Better Auth secret, canonical HTTP localhost origin and a non-working Stripe test placeholder. It does **not** receive migration credentials, R2 or Postmark credentials, inherited provider keys, or a live mail transport. After a successful `seed`, customer/admin sign-in and the synthetic paid project are usable locally; authenticated image upload/download will fail closed without real test-only R2 credentials. `app --with-r2` reads `r2-test.json` inside the private local directory (mode 0600) and uses **real** R2 test buckets/requests: this is NOT a mocked R2. See `private-r2-runbook.md` for manual setup and spending controls. Without a separately authorized *test-only* Stripe secret, publishable key, matching test price IDs, webhook signing secret and tunnel/CLI forwarding to `http://127.0.0.1:45231/api/stripe/webhook`, checkout is NOT a real provider E2E. The local helper deliberately does not inject Stripe or Postmark provider credentials. For an authorized provider E2E plan, configure a separate private server-only env file, test-only account/products/prices matching `src/lib/stripe-price-allowlist.ts`, forward *signed test-mode* events with `stripe listen --forward-to 127.0.0.1:45231/api/stripe/webhook` (the CLI's `whsec_...` test signing secret must match the server's `STRIPE_WEBHOOK_SECRET`), and verify paid sessions, retries and durable fulfillment; never put a Stripe live key or webhook signing secret in this handoff. Postmark requires an owner-approved test sender/domain + controlled recipient mailbox and server token; no sends to either requested address without separate explicit permission. Production HTTPS secure cookies/proxy chain, forwarding headers and actual deployed TLS are NOT exercised by localhost HTTP: verify those separately with the documented trusted proxy settings before release. See `auth-runbook.md`, `test-runbook.md`, `private-r2-runbook.md` and `ops/postgres/README.md` for gates; neither mocked mail nor a synthetic checkout is proof of true provider E2E.

**History note:** The previous handoff commit `281f977` contains the two personal addresses in Git history. This change removes them from current tracked files but does **not** rewrite history; do not distribute that commit history without the owner deciding how to handle it.
