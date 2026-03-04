# Magic link flow

The post-checkout sign-in email now uses Supabase's hosted action links directly instead of rewriting them into `/auth/callback` URLs. Supabase verifies the OTP token and redirects buyers back to `/auth/callback` with either a PKCE `code` query param or an implicit `#access_token` hash.

Steps:

1. `buildAuthCallbackRedirect()` constructs `/auth/callback?next=…` (including projectId + email) and is passed to `supabase.auth.admin.generateLink` as `options.redirectTo`.
2. Supabase emails its hosted `action_link`. When clicked, Supabase completes the OTP and redirects back to the supplied callback.
3. `/auth/callback` handles the incoming hash/code and forwards to `/set-password`.

The helper script at `apps/web/scripts/debug-magic-link.mjs` can be run locally to inspect the raw `action_link` values returned by Supabase:

```bash
cd apps/web
node scripts/debug-magic-link.mjs purchaser@example.com optional-project-id
```

Because we rely on Supabase to manage the redirect now, there is no repo-side rewriting of `action_link` URLs. If callbacks ever misbehave, capture both the logged `action_link` and the browser URL after Supabase redirects, then update the callback page if the format changes.
