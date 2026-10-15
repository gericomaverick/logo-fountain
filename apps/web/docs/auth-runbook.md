# Auth runbook (Better Auth on portable PostgreSQL)

Server-side auth uses `better-auth` 1.7.10 with its supported Prisma adapter. Every identity is one UUID shared by `AuthUser` and `Profile`.

## Configuration

- `BETTER_AUTH_SECRET`: at least 32 random characters, server-only. Rotating it invalidates every session cookie.
- `PUBLIC_SITE_URL`: canonical origin. Auth `baseURL`, email links and mutation provenance all use it; in production it must be `https`.
- `POSTMARK_SERVER_TOKEN` / `POSTMARK_FROM`: the only transport for setup, recovery and magic links. If they are missing, link requests fail closed with the same generic response.
- `ADMIN_NOTIFICATION_EMAILS`: notification recipients only. It grants no access.
- The reverse proxy must strip client-supplied `x-forwarded-for` / `x-real-ip` and set its own. Shared PostgreSQL rate limits key on them (20 per address and 5 per identity per route per 15 minutes). Without a proxy, all clients share one address bucket.

## Surface

These are the only app routes; no Better Auth catch-all handler is mounted:

- `POST /api/auth/login`
- `POST /api/auth/magic-link` and `POST /api/auth/magic-link/verify`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password` (handles both setup and recovery proofs)
- `POST /api/auth/password` (change with current password)
- `POST /api/auth/logout`
- `GET /api/auth/session`

Sign-up, email change, and setting a password without proof are not reachable. Every mutation requires canonical `Origin`/`Referer`, a JSON body of at most 8 KiB, and returns `no-store` with generic errors.

## Lifecycle rules

- **Paid provisioning** (Stripe fulfillment only) creates the normalized email, UUID `AuthUser`, `Profile` and owner membership in one transaction, keeping the existing UUID on retries. It does **not** verify the mailbox, set a password, or grant admin.
- **Setup and recovery links** last 1 hour, are single-use, and carry the token in the URL fragment (`/set-password#token=…`, `/reset-password#token=…`). The page strips the fragment from history and POSTs it. Success sets the password, marks the mailbox verified, invalidates every outstanding proof, revokes **all** sessions, and sends the user to sign in.
- **Magic links** last 1 hour, are single-use, and only take effect after the explicit "Confirm sign-in" POST (opening the page via GET consumes nothing). They prove the mailbox but never set a password.
- **Password change** requires a session plus the current password. On success **all** sessions end, including the current one.
- **Sessions** are database rows with refresh and cookie cache disabled and an absolute cap of 7 days from creation.
- **Race fencing:** login, reset/setup, magic verification and change each hold one PostgreSQL transaction with `pg_advisory_xact_lock` on the user id. Better Auth's native reads and writes run inside that transaction, so concurrent credential changes cannot interleave, and a failure rolls back the native token consumption too.

## One-time admin bootstrap (operator only, owner-run)

Admin is the `Profile.isAdmin` flag. A database trigger lets only the table owner (the migration role) change it, and the runtime role has no access to `AuthAdminBootstrap`. Nothing in the app or its environment can promote a user.

Run these from `apps/web` with `DATABASE_URL` (runtime) and `DIRECT_URL` (migration owner) exported for the target. Both are validated as a distinct pair on the same host and database. The script does not read `.env` files.

1. `node scripts/bootstrap-admin.mjs --prepare --email you@example.com` creates or finds an **unprivileged, unverified** identity and prints its UUID. This step promotes nothing.
2. Request a password reset for that address at `/forgot-password` and complete it from the mailbox. This proves mailbox ownership and sets the password.
3. `node scripts/bootstrap-admin.mjs --email you@example.com --confirm-user <UUID> --ack ONE_TIME_ADMIN_BOOTSTRAP` promotes the user. It refuses if the mailbox is unverified, the UUID and email don't match, an admin already exists, or a bootstrap was already recorded. It records the singleton and an audit event in the same transaction.

Later admins are an owner decision outside this tool; the bootstrap cannot be reused.

## Not covered here

Deploying the baseline, running the bootstrap against a live database, and live Postmark delivery are owner-run release steps. They were exercised only against throwaway PostgreSQL and a mocked mail transport (see `docs/test-runbook.md`).
