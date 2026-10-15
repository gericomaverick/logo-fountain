# Admin health checks

Use this preflight before handoff, after deploys, or when admin flows fail.

## Endpoint

- **Route:** `GET /api/admin/health`
- **Auth:** Admin-only (requires signed-in admin user)
- **Response:** Structured JSON with per-check pass/fail, summary counts, and `nextStep` guidance.

### Checks included

1. **Env vars present**
   - `BETTER_AUTH_SECRET`
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_CONCEPTS_BUCKET`, `R2_FINAL_DELIVERABLES_BUCKET`
   - `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`, `PUBLIC_SITE_URL`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `ADMIN_NOTIFICATION_EMAILS` (notification recipients only; grants no access)
2. **Database connectivity**
   - Runs `SELECT 1` via Prisma.
3. **Stripe connectivity**
   - Calls Stripe `accounts.retrieve()` with `STRIPE_SECRET_KEY`.
4. **Private R2 buckets**
   - Sends a bucket HEAD with the scoped server credentials and verifies:
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
  - Bucket is never created automatically; follow `apps/web/docs/private-r2-runbook.md` (owner-run).

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
