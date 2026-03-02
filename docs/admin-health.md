# Admin health checks

Use this preflight before handoff, after deploys, or when admin flows fail.

## Endpoint

- **Route:** `GET /api/admin/health`
- **Auth:** Admin-only (requires signed-in admin user)
- **Response:** Structured JSON with per-check pass/fail, summary counts, and `nextStep` guidance.

### Checks included

1. **Env vars present**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `ADMIN_EMAILS`
2. **Database connectivity**
   - Runs `SELECT 1` via Prisma.
3. **Stripe connectivity**
   - Calls Stripe `accounts.retrieve()` with `STRIPE_SECRET_KEY`.
4. **Supabase Storage buckets**
   - Lists buckets with admin client and verifies:
     - `concepts`
     - `final-deliverables`

## Admin UI

- **Page:** `/admin/health`
- Loads and renders all health checks with:
  - ✅/❌ status
  - concise summary
  - copy-pastable fix guidance (`nextStep`) in a code block
- Includes a **Re-run checks** button.

## Typical failures and fixes

- **Missing env var**
  - Add the key in your hosting env configuration and redeploy.
- **DB connectivity failed**
  - Validate `DATABASE_URL`, DB network allowlist, DB service status.
- **Stripe connectivity failed**
  - Confirm `STRIPE_SECRET_KEY` is valid for the intended account and environment.
- **Bucket missing**
  - Create missing bucket in Supabase Dashboard → Storage.

## Example response shape

```json
{
  "ok": false,
  "summary": { "total": 10, "passed": 8, "failed": 2 },
  "checks": [
    {
      "key": "env:STRIPE_SECRET_KEY",
      "label": "Stripe secret key",
      "passed": true,
      "summary": "Present",
      "nextStep": "No action needed."
    }
  ],
  "generatedAt": "2026-03-02T17:00:00.000Z"
}
```
