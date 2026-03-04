# Logo Fountain — Resetting Development Client Data

Use the `apps/web/scripts/reset-client-data.mjs` helper whenever you need to wipe all client-facing information from the shared Supabase/Postgres stack while keeping the admin account(s) untouched.

## What the script does

- Loads `.env.local` (falls back to `.env`) for connection details.
- **Prisma-managed tables:** deletes everything in `ProjectReadState`, `AuditEvent`, `ConceptComment`, `RevisionRequest`, `Message`, `MessageThread`, `FileAsset`, `Concept`, `ProjectBrief`, `ProjectEntitlement`, `ProjectOrder`, `Project`, `ClientMembership`, `Client`, and `StripeEvent`.
- **Profiles:** removes every `Profile` that is _not_ an admin. Admin detection uses `ADMIN_EMAILS` allowlist plus any row with `isAdmin = true`.
- **Supabase auth:** removes all non-admin auth users (same `ADMIN_EMAILS` allowlist). Service accounts that lack an email are skipped.

## How to run it

```bash
cd apps/web
npm run reset:client-data -- --force
```

Requirements:

1. `.env.local` must provide `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_EMAILS` (comma-separated list).
2. Run with `--force` to acknowledge the destructive action. Without it, the script aborts.

After the script finishes, your local dev environment mirrors a fresh install—only the admin auth + profile entries remain, so you can sign back in with the same credentials that were originally seeded via `npm run seed:admin`.
