# L4 parity run, 2026-11-23 (workbench/parity-4-5, base 619e466)

Gates `@auth`, `@checkout`, `@entitlements`, once each, on Laravel (`node scripts/laravel-stack.mjs "<gate>"`, then `down -v`) and on Next (`next-stack.mjs "<gate>"` on `npm run infra:up`, test-only credentials, then `infra:down`). No portal or Next code changed.

| Gate | Tests | Next pass / fail / skip | Laravel pass / fail / did-not-run |
|---|---|---|---|
| @auth | 37 | 37 / 0 / 0 | 15 / 11 / 11 |
| @checkout | 28 | 28 / 0 / 0 | 1 / 20 / 7 |
| @entitlements | 10 | 10 / 0 / 0 | 0 / 10 / 0 |

Playwright stops a run after its failure cap, so "did not run" tests were never reached. Deviation tests (expected-next-failures.txt) behaved as listed on Next: every run exited 0, and the runner fails a run in which a listed test passes. On Laravel they were not reached or failed for the reasons below, so DV-19..DV-26 deviation tests are **not** shown to pass on Laravel by this run.

Harness fault fixed: `apps/web` needs `npx prisma generate` after `npm ci` (install scripts are blocked), otherwise every Next route is 500 (first Next run: 11/16/9 failures, all `Can't resolve '../generated/prisma/client'`). Not a repo change.

## Why Laravel fails (not papered over; stories stay at `review`)
1. **The Laravel stack is not wired to the parity infra** (`laravel-stack.mjs:11-12`, "Not wired yet"): the app container has no `STRIPE_API_BASE` (stripe-fake), `STRIPE_WEBHOOK_SECRET`, Postmark shim or Mailpit. Seen as `checkout start failed: 500` / `CHECKOUT_SESSION_FAILED` (8 in @auth, 5 in @checkout), `STRIPE_WEBHOOK_SECRET not set` (@entitlements), `expected 1 new email(s) ... got 0` (A-05/N-03 magic-link). Laravel's Postmark transport has no base-URL setting, so mail cannot reach the shim without a portal change. Needs an owner/story decision (wire the overlay, or a Laravel-side test seam).
2. **Not built yet**: page objects `auth.signIn` (story 4.9b) and `checkout.start` (5.1) are "not implemented" for Laravel, so every `@ui` journey (J1, J2, J9, J10, J11, J21, DV-UX) fails; `GET /api/admin/projects` and `/api/admin/projects/{id}/entitlements[/reset]` and the project entitlements API are 404 (Epics 6+).
3. Therefore no per-test comparison of Laravel to Next was possible for the email, checkout and entitlement tests.

## Failing on Laravel (title; error class; Next: passes)

### @auth
- journeys/contract/auth-links.spec.ts:51:1 › A-05/N-03 magic-link request: uniform message, one sign-in email with a fragment link @api @auth @email
- journeys/deviations/dv-ux-navigation.spec.ts:20:1 › DV-UX/C-01/A-01 a customer with exactly one project lands on that project after sign-in @deviation @ui @auth
- journeys/deviations/dv-ux-navigation.spec.ts:36:1 › DV-UX/A-06/N-01/C-01 after setting a password from the setup link the customer reaches the project the link names @deviation @ui @auth @checkout
- journeys/j1-purchase.spec.ts:15:1 › K-01/K-02/K-06/A-06/N-01/C-01 J1 a new buyer pays, the success page confirms, the setup link sets a password and the project awaits the brief @ui @checkout @auth @email
- journeys/j10-password-reset.spec.ts:17:1 › A-07/A-08/N-03 J10 a forgotten password is reset from the emailed link, which ends old sessions and old links, and the new password signs in @ui @auth @settings @email
- journeys/j11-logout.spec.ts:13:1 › A-02/A-03 J11 signing out ends the session on the server and the back button reveals no protected page @ui @auth @settings
- journeys/j2-returning-customer.spec.ts:15:1 › A-05/A-06/N-02/K-06 J2 a returning customer buys again, gets a sign-in link, confirms it and lands signed in on the new project @ui @auth @checkout @email
- journeys/j21-open-redirect-rate-limit.spec.ts:39:1 › A-13/A-01 J21 open-redirect next payloads through the sign-in screen end on a page of the app @security @ui @auth
- journeys/j21-open-redirect-rate-limit.spec.ts:54:1 › A-13/A-05/A-18 J21 a sign-in link whose next was rewritten to another site ends on a page of the app @security @ui @auth
- journeys/j21-open-redirect-rate-limit.spec.ts:81:1 › A-01/X-06 J21 a rate-limited sign-in shows exactly the wrong-password message, even with the right password @security @ui @auth
- journeys/j9-settings.spec.ts:17:1 › C-17/C-18/K-11/A-09 J9 the customer renames themselves, sees their invoice and changes the password, which ends every session including this one @ui @settings @invoices @auth

### @checkout
- journeys/contract/admin-ops.spec.ts:46:1 › K-12 reprocess fulfils a paid session, is deduped on repeat and is 409 CHECKOUT_SESSION_NOT_PAID for unpaid @admin @api @ops @checkout
- journeys/contract/auth-links.spec.ts:156:1 › A-06/N-02 setup: a fresh purchaser with no password gets a setup link that sets the first password @api @auth @checkout @email
- journeys/contract/checkout-contracts.spec.ts:37:1 › K-01 checkout start redirects 303 to the hosted Stripe page with an allowlisted session @api @checkout
- journeys/contract/webhook-fulfilment.spec.ts:25:3 › K-06,K-07,N-01,N-10 a paid essential purchase creates the project with 1/1 entitlements, a setup email and the admin email @webhook @checkout @email @api
- journeys/contract/webhook-fulfilment.spec.ts:25:3 › K-06,K-07,N-01,N-10 a paid professional purchase creates the project with 2/2 entitlements, a setup email and the admin email @webhook @checkout @email @api
- journeys/contract/webhook-fulfilment.spec.ts:25:3 › K-06,K-07,N-01,N-10 a paid complete purchase creates the project with 3/3 entitlements, a setup email and the admin email @webhook @checkout @email @api
- journeys/contract/webhook-fulfilment.spec.ts:76:1 › K-06,N-02 a returning customer with a password gets a sign-in link, not setup, on a new client and project @webhook @checkout @email @api
- journeys/contract/webhook-fulfilment.spec.ts:99:1 › K-06 a paid purchase without any customer email is NEEDS_CONTACT and provisions nobody @webhook @checkout @email @api
- journeys/contract/webhook-payment-states.spec.ts:18:1 › K-05 an unpaid completed session is not fulfilled and the event is marked processed @webhook @checkout @api
- journeys/contract/webhook-payment-states.spec.ts:33:1 › K-05 a delayed payment that succeeds later is fulfilled from a fresh session retrieve @webhook @checkout @email @api
- journeys/contract/webhook-payment-states.spec.ts:52:1 › K-05 a delayed payment that fails is recorded without fulfilment @webhook @checkout @api
- journeys/contract/webhook-payment-states.spec.ts:72:3 › K-05 a paid session with two package line items is a permanent error and is marked processed @webhook @checkout @api
- journeys/contract/webhook-payment-states.spec.ts:72:3 › K-05 a paid session with a non-allowlisted price (metadata.package_code is ignored) is a permanent error and is marked processed @webhook @checkout @api
- journeys/deviations/dv-checkout.spec.ts:43:1 › DV-1/K-13 every Checkout Session the app creates allows promotion codes (packages, add-on, upgrade) @deviation @api @checkout @upsell
- journeys/deviations/dv-checkout.spec.ts:58:1 › DV-5/K-01/K-08 Stripe success and cancel URLs come from the canonical origin even when Host/X-Forwarded-Host is forged @deviation @api @checkout @upsell @security
- journeys/deviations/dv-reprocess.spec.ts:14:1 › DV-6/K-12/N-01/N-10 reprocess sends the customer setup email and the admin new-project email once, and a repeat sends nothing @deviation @api @admin @checkout @email
- journeys/deviations/dv-ux-navigation.spec.ts:36:1 › DV-UX/A-06/N-01/C-01 after setting a password from the setup link the customer reaches the project the link names @deviation @ui @auth @checkout
- journeys/j1-purchase.spec.ts:15:1 › K-01/K-02/K-06/A-06/N-01/C-01 J1 a new buyer pays, the success page confirms, the setup link sets a password and the project awaits the brief @ui @checkout @auth @email
- journeys/j18-admin-reprocess.spec.ts:14:1 › K-12 J18 the admin reprocesses a paid checkout whose webhook never arrived; the project and order appear once @admin @ui @checkout @ops
- journeys/j2-returning-customer.spec.ts:15:1 › A-05/A-06/N-02/K-06 J2 a returning customer buys again, gets a sign-in link, confirms it and lands signed in on the new project @ui @auth @checkout @email

### @entitlements
- journeys/contract/admin-entitlements.spec.ts:8:1 › D-14 entitlement override validation codes @admin @api @entitlements 
- journeys/contract/admin-entitlements.spec.ts:29:1 › D-14 entitlement override changes only the limits and audits before/after @admin @api @entitlements @audit 
- journeys/contract/admin-entitlements.spec.ts:53:1 › D-14 entitlement override accepts null (unlimited) and limits below current usage @admin @api @entitlements 
- journeys/contract/admin-entitlements.spec.ts:68:1 › D-14 standalone entitlement usage reset is disabled: 409 ENTITLEMENT_USAGE_RESET_DISABLED @admin @api @entitlements 
- journeys/contract/client-authz.spec.ts:66:1 › C-16 GET entitlements guards: 401 anonymous, 404 non-member, unknown and admin @api @client @entitlements @authz 
- journeys/contract/client-projects.spec.ts:159:5 › entitlements › revision-reserved › C-16 GET /api/projects/{id}/entitlements returns remaining = limit - consumed - reserved @api @client @entitlements 
- journeys/contract/client-projects.spec.ts:167:5 › entitlements › revisions-exhausted › C-16 entitlements clamp at zero when revisions are used up @api @client @entitlements 
- journeys/contract/client-projects.spec.ts:175:5 › entitlements › two-tenants › C-16 entitlements are member-only: anonymous 401, other tenant and admin 404 PROJECT_NOT_FOUND @api @client @entitlements @authz 
- journeys/deviations/dv-upsell.spec.ts:16:1 › DV-2/K-09 an upgrade after a bought add-on keeps it: Essential 1/1, add-on 1/2, upgrade to Professional 2/3 @deviation @api @upsell @webhook @entitlements 
- journeys/j16-admin-entitlements-reset.spec.ts:12:1 › D-14/D-15/D-16/X-08 J16 the admin overrides an allowance with a reason and resets the project; stored files survive and the audit log shows both @admin @ui @entitlements @audi
