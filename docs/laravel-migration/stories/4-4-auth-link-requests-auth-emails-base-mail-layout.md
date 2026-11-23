# Story 4.4: Auth link requests, auth emails, base mail layout

**Status:** review (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-06, A-11, N-01, N-02, N-03, N-14 (base layout), ADR-018 · **Gate:** `@auth&@api` (link endpoints), `@email&@api` · **After:** 4.2, 2.7 (done) · **Stacks on:** `main` (dependencies done); in the SERIAL chain, the previous Epic 4 story's branch. Shared files: `routes/auth.php`, `app/Actions/Auth/`, `resources/views/mail/layouts/`, `app/Support/Mail/MailTheme.php`

> Created with the repo's create-story form. All `apps/web` `file:line` checked 2026-11-22.

## Story
As someone who forgot their password or bought a logo, I get a single-use link by email, and nobody can use the form to find out who has an account.

## Acceptance criteria
1. **`POST /api/auth/magic-link {email,next}`.** Always `200 {ok:true,message:"If that account exists, a sign-in link has been sent."}` for any well-formed body, whether or not the account exists, the limit denies, or delivery fails (`magic-link/route.ts:6-10`). Email is trimmed/lowercased; an email without `@` skips work but still answers 200.
2. **`POST /api/auth/forgot-password {email}`.** An empty email or one without `@` → `400 INVALID_EMAIL "Enter a valid email address."`; otherwise always `200 {ok:true,message:"If that account exists, a password recovery email has been sent."}` (`forgot-password/route.ts:7-11`).
3. **Limits.** `RateLimits::consumeAuth(path, address, email)`: address 20 and identity 5 per 15 min (`http.ts:46-48`, `rate-limit.ts:7-8,33`). A denied request sends nothing and still answers 200 (`route.test.ts:26`).
4. **One link per request.** For an existing account exactly one proof is issued and one email sent. Magic: `kind magic`, link `/auth/callback#token=…&next=…`. Reset: `/reset-password#token=…&next=…`. Setup: `/set-password#token=…&next=…`. Token in the fragment, never the query (`server.ts:51-52,62-63`). `next` passes `SafeNext` (4.8 owns it; this story calls the existing helper if present, otherwise a stub that returns `/dashboard`).
5. **Setup degrades.** Requested as setup but a password exists (checked under the fence) → issues a magic link instead; never resets an existing password (`service.ts:33`, `integration.test.ts:138`).
6. **Send after commit (ADR-018, auth mode).** Proof is written inside the fence; the email is sent synchronously after the transaction commits, so no lock or connection is held during the send (`service.ts:46-56`, `integration.test.ts:162`).
7. **Delivery failure.** On any send failure the proof row is deleted, the caller gets the fixed error, and logs contain no link, token or provider body (`service.ts:51-54`, `mail.ts:59-63`; `/__fail` on the postmark shim). The endpoints above still answer their generic 200 (`:8`/`:9` catch).
8. **Copy.** Subjects and text exactly: reset "Reset your Logo Fountain password", setup "Finish setting up your Logo Fountain account", sign-in "Your Logo Fountain sign-in link"; bodies and CTA labels from `mail.ts:20-40` (N-01, N-02, N-03). HTML and text parts both.
9. **Base layout (N-14).** `resources/views/mail/layouts/base*.blade.php` and `MailTheme` carry the branded header (logo URL `/img/logo.svg` from the canonical origin, else an embedded fallback; `email-branding.ts:65-73`), a CTA button, and a footer; the layout is the one 2.7 and 8.1 use. Escaping of every interpolated value is tested.
10. **Postmark.** Stream `outbound`; message-stream header and `From` from `POSTMARK_FROM`; 10 s timeout; non-2xx raises without reading the body (`mail.ts:42-63`).
11. **No account created by these endpoints.** Unknown email: no row, no proof, no email, same response and equal-order latency is not promised (see open question 2).

## Inventory scope
A-06 (set-password link half), A-11 (send half), N-01, N-02, N-03, N-14. Ledger #66 cases 8–10; `forgot-password/route.test.ts`, `magic-link/route.test.ts` (3 each).

## Next.js source read
`app/api/auth/magic-link/route.ts:4-12`; `forgot-password/route.ts:4-13`; `lib/auth/service.ts:21-58`; `lib/auth/server.ts:25-66`; `lib/auth/mail.ts:1-71`; `lib/email-branding.ts:1-91`; `lib/auth/http.ts:46-48`; brownfield §2, §6 notifications N-01..N-03.

## Behaviour notes
- Next's reset email says "Thanks for your purchase" only for setup and sign-in; the reset text says "All sessions will be revoked."
- The proof is recorded inside the fence even though the email goes out later; a crash between commit and send leaves a live proof nobody received (harmless: hashed, expires in 1 h).
- The setup email is first sent from provisioning (Epic 5, webhook); this story exposes `SendAuthLink::handle(user, kind, next)` for it.

## Laravel guidance
`app/Actions/Auth/SendAuthLink.php`, two controllers, `app/Mail/AuthLinkMail.php` (a plain `Mailable`, **not** queued: auth mode), `LifecycleMail` pipeline untouched. Postmark through Laravel's transport; the shim URL via `parity` config as in 2.7.

## Planned deviations from Next.js
None. (Equalising latency for unknown accounts is not attempted; open question 2.)

## Tasks
1. Base layout + `MailTheme` (AC 9). 2. `SendAuthLink` (AC 4–7). 3. Controllers/routes (AC 1–3, 11). 4. Mailable copy (AC 8, 10). 5. Tests, record, inventory, ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 `@auth&@api` | `tests/Feature/Auth/MagicLinkRequestTest.php`, `ForgotPasswordRequestTest.php`: AC 1–3, 11 | A-05/A-07 request halves |
| L2 `@auth` | `SendAuthLinkTest.php`: AC 4–7 (mail fake, `Http::fake` for Postmark failure, proof deleted, log has no token) | A-11 |
| L2 `@email&@api` | `tests/Feature/Mail/AuthLinkMailTest.php`: subjects, copy, escaping, layout | N-01–N-03, N-14 |
| L3 `@pg-race` | send happens after commit: a slow fake sender doesn't hold the advisory lock (ledger #66 case 9) | A-10 |
| L4 parity | `contract/auth-links.spec.ts` | A-05, A-06, A-11 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Open questions (with recommendations)
1. **Mailable vs raw Postmark call.** *Recommendation:* a Laravel Mailable through the postmark transport (ADR-018), not a hand-rolled HTTP call.
2. **Timing equalisation for unknown accounts.** Next does less work for them. *Recommendation:* leave it; the response body is identical and the endpoint is rate-limited; note it in RISKS.
3. **Owner items: none.**

**Decided (owner, 2026-11-23):** Q1 (Laravel Mailable via the Postmark transport) as recommended. **Q2 corrected (owner, 2026-11-23): equal time for known and unknown accounts.** The request does the same account lookup on both paths and queues `SendAuthLinkMail` (the proof and the email are issued in the job; an unknown account sends nothing); the response never waits on a send (DV-27). Applies to magic-link and forgot-password. The checkout resend-link route (story 5.4) is a separate endpoint and still sends synchronously.

## Conversion record

> Fill at implementation, from `templates/story-conversion-record.md`. Write *Behaviour notes* before converting.

### Inventory scope
_(stub)_
### Next.js source read
_(stub)_
### Behaviour notes
_(stub)_
### Laravel implementation
_(stub)_
### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
### Test evidence
_(commands, pass/fail counts, what was not run and why)_
### Gotchas
### Docs updated
### Open items


## Conversion record

### Inventory scope
A-06 (link half), A-11 (send half), N-01, N-02, N-03, N-14 base layout. Ledger #23, #26 (request halves).
### Next.js source read
`lib/auth/service.ts:21-58`, `lib/auth/mail.ts`, `lib/email-branding.ts`, `api/auth/magic-link/route.ts`, `api/auth/forgot-password/route.ts` and their tests.
### Behaviour notes
Same 200 body for unknown account, limit denied and failed delivery. Setup degrades to sign-in when a password exists. Mail is sent synchronously after the fence commits; failure deletes the proof and throws a fixed message.
### Laravel implementation
`app/Actions/Auth/SendAuthLink.php`, `app/Http/Controllers/Auth/AuthLinkRequestController.php`, `app/Mail/AuthLinkMail.php`, `AuthProofs::issueIn/discard`, `MailTheme::logoUrl/safeUrl`, branded header in `mail/layouts/base.blade.php`, `routes/auth.php`.
### Deviations from Next.js
`SafeNext::path` is a stub returning `/dashboard` until story 4.8 ports `safeAuthNextPath`. Mail colours were NOT moved to app.css tokens (kept the original palette so emails match Next); see DECISIONS.
### Tests
`tests/Feature/Auth/SendAuthLinkTest.php`, `AuthLinkRequestTest.php`, `tests/Feature/Mail/AuthLinkMailTest.php`; helper `tests/Support/ProbeTransport.php`.
### Test evidence
`bin/test` green: Pint, Larastan 9, Pest 1783 passed (4958 assertions).
### Open items
Palette move to tokens (owner call); `next` sanitising lands in 4.8; L4 parity contract not run.

**L4 parity run (2026-11-23, workbench/parity-4-5):** @auth 37 tests: Next 37 pass; Laravel 15 pass / 11 fail / 11 not reached. @checkout 28: Next 28 pass; Laravel 1 / 20 / 7. @entitlements 10: Next 10 pass; Laravel 0 / 10 / 0. Failures are the unwired Stripe/Postmark/Mailpit infra on the Laravel stack and not-yet-built pages/routes, listed with titles in `docs/laravel-migration/parity-run-2026-11-23.md`. This story's parity tests are not shown to match: stays at `review`.
