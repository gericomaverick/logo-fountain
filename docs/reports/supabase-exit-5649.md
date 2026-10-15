# Supabase exit 5649 — architecture gate and implementation record

## Summary
- Isolated branch `workbench/supabase-exit-5649`, starting at `ef4190d1be1f752e072e28e89255d98fd61ed4a2`; earlier remediation refs remain intact.
- Stage 0 research complete; this section precedes implementation. The exit is **not yet implemented or release-ready**.
- Select Better Auth **1.7.10**, its supported Prisma adapter, and AWS S3 client/presigner **3.1152.0** for private R2.
- Disposable data allows a fresh installation, not deletion or migration of any live resources.
- Preserve app-layer tenant authorization; do not claim PostgreSQL RLS protects the new runtime.
- No new owner policy decisions identified. Atomic auth fencing and real PostgreSQL tests are implementation gates, not optional follow-ups.
- Live R2 acceptance, credentials, bucket configuration, deployment, and live database operations remain unperformed/unapproved.

## Stage 0: evidence and compatibility

Read TODO and test runbook; searched relevant product/API/schema/state/payment/RLS/journey specs. Revalidated source against supplied scope/inventory, including the corrected target-revision section. The prior filesystem recommendation is superseded by the owner's explicit R2 choice.

Evidence collected under `/tmp/supabase-exit-5649/`: registry JSON, unpacked published Better Auth/core/Prisma-adapter packages, official documentation HTML, proposed dependency lock and audit. These are research artifacts, not installed application changes. Official references:

- https://www.better-auth.com/docs/adapters/prisma
- https://www.better-auth.com/docs/integrations/next
- https://www.better-auth.com/docs/authentication/email-password
- https://www.better-auth.com/docs/plugins/magic-link
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/pricing/

Registry `latest` is Better Auth **1.7.10**. Published peers explicitly admit Next `^16.0.0`, React/ReactDOM `^19.0.0`, Prisma/client `^7.0.0`, pg `^8`, and Vitest `^4`. This includes the approved Next **16.4.1**, React **19.2.9**, Prisma **7.10.0** stack. The Prisma adapter publishes transaction support, but **defaults it OFF**: explicitly set `prismaAdapter(prisma, { provider: 'postgresql', transaction: true })`. Import is the supported `better-auth/adapters/prisma` export. Next handler integration is `toNextJsHandler` from `better-auth/next-js`; server session API is `auth.api.getSession({ headers })`.

Better Auth and its adapter declare no top-level engine field. Resolved dependencies matter: Kysely **0.29.6** requires Node >=22; noble/hashes **2.4.0** requires >=20.19; both AWS packages require >=20. Current Node **24.22.0** satisfies these. Do not advertise Node 18 support. Scratch **full application manifest** resolution, removing only Supabase and adding the three selected dependencies, succeeded without peer overrides, force, or legacy-peer-deps. This is registry/resolution evidence, not runtime integration proof. Scratch audit: **9 high, 0 critical/moderate/low**, the same nine known nodes as approved remediation; no newly reported advisory root. Retain the previous remediation report and its four advisory explanations, including masked moderate MySQL2 finding. Independent site lock remains outside scope.

### Verified package API/behavior (published source, not assumptions)

- Core `types/init-options.d.mts`: `advanced.database.generateId: 'uuid'`; 7-day `session.expiresIn`; `session.disableSessionRefresh`; `cookieCache.enabled`; password `disableSignUp`, `requireEmailVerification`, `resetPasswordTokenExpiresIn`, `sendResetPassword`, `onPasswordReset`, `revokeSessionsOnPasswordReset`.
- `plugins/magic-link/index`: `magicLink({ expiresIn: 3600, disableSignUp: true, storeToken: 'hashed', sendMagicLink })`; tokens consumed atomically before session creation. `allowedAttempts` is deprecated/ignored except one: do not rely on multi-attempt behavior.
- `api/routes/password` and `utils/password`: native reset consumes the token **inside the same adapter transaction** as session revocation and credential creation/update when transactions are enabled. Reset can establish the first credential for an existing account.
- `api/routes/update-user`: native `changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers })` verifies current password and atomically deletes old sessions, updates credentials, and rotates current session. Do not allow a public caller to turn revocation off. End the new rotated session as well if implementing logout-after-change.
- Password implementation uses maintained Better Auth utils' Node `crypto.scrypt`, not a replacement bespoke hash.
- Prisma adapter `consumeOne`/transaction implementation uses conditional deletion to ensure a single verification value cannot mint multiple sessions. This must also be exercised on real PostgreSQL.

### Auth and identity design

Introduce library User/Session/Account/Verification (and database rate-limit state if selected) models. All user IDs and relational auth FK columns are PostgreSQL UUIDs. `Profile.id` remains the same UUID as User.id with an explicit relation: application membership/actor FKs do not change identity meaning. Account provider account IDs and verification identifiers remain text, not UUIDs. Never copy old Supabase account IDs or hashes.

Database-backed opaque sessions, seven-day **absolute** maximum: disable sliding session refresh and cookie-cache authority; server authorization queries current DB state. Database outage must remain sanitized 503, not unauthenticated success. Native `null` absent session is distinguishable from thrown verification failures. Keep non-cacheable session responses and verified logout UI (POST succeeds, then fresh session check confirms absence before navigation).

Setup/recovery links: single-use, 3600 seconds, native reset flow, existing provisioned account only. Password reset revokes all sessions. Reset succeeds only with native reset-token proof, never ordinary signed-in state. Mailbox proof must be established before password sign-in/admin eligibility; reset completion can mark verified only after verified token consumption. Magic sign-in uses the maintained plugin with one-hour hashed tokens; successful mailbox verification may authenticate, but a regular session must not acquire recovery authority.

**Additional app fencing is required:** native atomic single-token reset does not by itself invalidate every separately outstanding reset token, nor serialize an in-flight old-password change against reset. Controlled auth routes must serialize per-user credential transitions and revalidate proof after acquiring the fence; revoke older reset tokens in the same protected transition. Prevent bypass through the native catch-all handler (allowlist endpoints; force revocation policy). Test distinct-token reset/reset, reset/change, session revocation, replay, failure rollback, and expired links in real PG. Do not claim native transactions alone solve these app-level races.

Checkout provisioning: normalize email, create/find unverified User by unique normalized email with stable UUID, then atomically upsert matching Profile and membership. Concurrent paid recovery must converge without scanning auth users or provider invites. Paid/session/webhook fencing and relationship/throttle rules remain unchanged. First setup and sign-in email continue through Postmark; no bearer/action URL in checkout API responses, audit payloads, or logs. Payment email never grants mailbox ownership.

Admin grants: remove runtime `ADMIN_EMAILS` escalation. Explicit operator-only one-time bootstrap command, transactional/single-winner guard, existing mailbox-verified User only, no HTTP bootstrap route, no automatic first-user admin. Document operator verification/setup and lock the bootstrap after its first successful use. No unverified-email grants.

Keep canonical-Origin/verified Referer mutation checks, safe-next allowlist/normalization, no URL token fallback/session injection, logout verification, API membership/admin checks and SSR guards. Block unknown native auth endpoints from bypassing these boundaries. Public checkout email exceptions stay narrowly scoped possession-token flows, not cookie-auth mutation exemptions.

### Private R2 design

Supported `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, region `auto`, account R2 S3 endpoint; credentials server-only. Two private buckets preserve existing logical namespace metadata (`concepts`, `final-deliverables`), configurable physical bucket names. No browser credentials or direct upload presigns. Use SDK PutObject with **IfNoneMatch `*`**, random immutable version paths, canonical MIME, and SHA-256 integrity metadata; never overwrite on retries. A conditional collision fails closed and cannot replace existing bytes.

Reads use SDK GetObject presigning, expiry validated as integer 1..3600; final disposition is signed, bounded and sanitized against CR/LF, quotes, slashes/control characters, with safe ASCII fallback/RFC5987 filename. Never persist/log signed URLs. Presigning is not authorization: retain exact project/membership/paid/lifecycle/active-final authorization immediately before issuance.

Keep upload-before-publication, immutable final retention, durable concept request receipts, transaction advisory locks, bounded retries, committed-receipt recovery and ambiguous-commit object retention. Provider replacement must not simplify those protocols. Health uses bucket HEAD without exposing diagnostics/secrets. Clean-slate/reset must retain immutable final bytes and receipt-backed concept objects. No new automatic cleanup policy.

R2 docs confirm conditional writes and S3 presigning support. Unit/fake-S3 tests establish SDK command shape/signatures, not live R2 acceptance. Live acceptance must separately exercise private access denial, conditional collision, canonical MIME, signed disposition/expiry and retained-byte URLs, using operator-provided isolated resources only.

### Portable PostgreSQL and operations

Archive historical migration directories unchanged outside active migration path, explicitly historical/non-deployed. Generate one fresh vanilla PostgreSQL lineage from the final Prisma schema, including existing entitlement/receipt indexes/checks/uniqueness requirements. Do not recreate Supabase roles, auth schema, forced RLS or historical deployment fiction. Keep server-side tenant checks; runtime role is not a tenant isolation boundary.

Separate migration owner and runtime login. Runtime: no superuser, CREATEDB, CREATEROLE, BYPASSRLS, ownership or schema CREATE; only CONNECT/USAGE, needed table DML/sequence rights. Migration role owns app schema and applies migrations. Revoke PUBLIC schema CREATE and unnecessary access. Document grants/default privileges for future migrations. Separate same-host app and DB services/private networking, database volume, SCRAM credentials, backups/restore drills. No infrastructure operations are authorized here.

Validate DATABASE_URL **and** DIRECT_URL before migration: PostgreSQL scheme, explicit database/user/host, no Supabase/pooler targets, same DB target (allow equivalent host names only through an explicit documented mapping), distinct runtime/migration users; no fallback to runtime credentials. Refuse unsafe targets before Prisma invokes migration. Never print credentials.

Private R2 operations: scoped bucket object read/write credentials; separate restricted cleanup credential if deletion is enabled, no account-wide admin credentials. No CORS needed for current server uploads/navigation/download and ordinary image use; explicit trusted-origin GET/HEAD-only CORS if a future browser fetch/Canvas consumer needs it. No public bucket/custom public endpoint. Current pricing documents 10 GB-month standard storage, 1M Class A and 10M Class B operations/month free tier; verify current pricing before release. Usage alerts are **not a hard spending cap**. Monitor stored/orphan bytes, operations, DB growth and egress paths. Retention is indefinite until separately approved audited housekeeping; never expire objects while signed URLs/receipts can still require them. Back up PostgreSQL plus private objects and test a joined restore/reference inventory. No live setup here.

### Staged commits and validation gate

1. This architecture/evidence report and TODO gate (before large changes).
2. Provider-neutral DB URL/role preflight and portable schema/migration lineage after auth models are finalized.
3. Private R2 SDK adapter, immutable/signing tests, health/env/ops replacement; preserve all publication protocols.
4. Better Auth integration/models, controlled auth routes/UI/session/checkout/bootstrap; retarget provider-specific tests without discarding safety assertions.
5. Disposable real PostgreSQL role/migration/auth/payment/entitlement/receipt/concurrency integration. Optional local S3 only if available; live R2 remains explicitly untested.
6. Sequential affected/full units, typecheck, lint, production build, owned browser port, dependency tree/audit and source/config inventory; final ops evidence/TODO and commits.

The documented shared queue executable is absent (`test -f` exit 1); Docker CLI exists but no usable daemon; no local postgres executable located during initial checks. GCC/make are available, so user-local disposable PostgreSQL tooling is a possible alternative. Never substitute mocked ORM calls or WASM single-connection SQL for real isolated PG concurrency evidence. Runs must remain sequential; no overlapping builders, no queue retry loops, no live credentials/resources.

Unresolved implementation gates: concrete auth fence/older-token invalidation and first-credential mailbox verification must pass real DB races; fresh lineage must preserve historical custom constraints; local PostgreSQL acquisition must succeed. These do not request a new owner architecture choice, but prohibit claiming the full exit complete before evidence exists.

## Stage 1 implementation: private R2 adapter

Implemented AWS SDK 3.1152.0 (only these two new direct dependencies installed so far), logical namespace mapping, private account endpoint, conditional immutable writes/integrity metadata, signed expiry/disposition checks, sanitized bucket HEAD health, confined cleanup and provider-neutral source imports. All publication, exact authorization, receipt and entitlement code paths remain in place. Extended clean-slate reset to retain **concept bytes as well as finals**, audit their references and expose retained references; deleting concept bytes immediately would break issued URLs/receipts. Existing reset safety assertions remain and now assert no storage deletion.

Added private R2 operational/acceptance runbook and environment example. Focused validation: **3 files / 29 tests pass**, including real SDK serialization and SigV4 through a loopback HTTP conditional-write harness; typecheck passes. This is not live R2 acceptance. Supabase Auth and DB remain; full exit not complete. Shared queue still absent; checks executed directly and sequentially. Local PostgreSQL binary package acquired outside repo; initial loader failure was resolved by publisher-provided symlink hydration and user-local library path; server not yet started/tested at this checkpoint.
