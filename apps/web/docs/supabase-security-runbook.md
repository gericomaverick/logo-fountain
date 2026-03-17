# Supabase / Database Security Runbook

Use this checklist before Vercel deploys and after schema changes.

## 1) Local pre-deploy checks

From `apps/web/`:

```bash
npm run security:check
npm run lint
npm run typecheck
```

`security:check` fails if:
- a `NEXT_PUBLIC_*` env var name contains `SERVICE_ROLE`
- a `NEXT_PUBLIC_*` env value matches `SUPABASE_SERVICE_ROLE_KEY`
- a `"use client"` module imports/uses Supabase admin client code

## 2) Migration posture (RLS + grants)

This repo enforces the following with migration `20260317130500_harden_public_schema_rls`:
- `REVOKE ALL` for `anon` and `authenticated` on public tables/sequences/functions
- default privileges in `public` also revoked for those roles
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` across all current public tables

After adding new tables/policies, run:

```bash
npx prisma migrate dev
```

## 3) Remote verification in Supabase SQL editor (manual)

If direct project access is available, run:

```sql
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

Expected:
- all app tables have `rowsecurity=true` and `forcerowsecurity=true`
- no broad table privileges for `anon`/`authenticated` unless intentionally added via explicit policy-driven design

## 4) Storage security follow-up

Storage bucket/object policies are not declared in Prisma migrations.
Verify in Supabase dashboard that:
- buckets are private unless explicitly public
- writes are restricted to trusted backend paths
- signed URL expiry is short-lived for sensitive assets

## 5) Incident quick response

If leakage is suspected:
1. Rotate `SUPABASE_SERVICE_ROLE_KEY` in Supabase
2. Update Vercel env vars and redeploy
3. Invalidate existing signed URLs (if relevant)
4. Re-run `npm run security:check` and remote SQL verification
