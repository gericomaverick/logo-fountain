# Story 0.3: Next.js test seams (freeze exceptions)

Status: done

**Covers:** O-09 · **Gate:** `@unit` (Vitest) · **After:** 0.2 (end-to-end use verified in 0.4/0.5) · **DoD:** E0

## Acceptance criteria
1. Seams are inert unless `PARITY_MODE=1`, and parity mode is refused in production.
2. (a) Postmark URL, (b) R2 endpoint plus path-style, (c) Stripe API base for **both** Stripe clients. (d) The seed script is delivered by story 0.4.
3. The existing unit suite still passes.

## Conversion record
- **Next source read:** `lib/auth/mail.ts:41`, `lib/project-lifecycle-email.ts:117`, `lib/storage/r2.ts:111`, `lib/stripe.ts:33`, `app/api/admin/health/route.ts:134`.
- **Implementation (apps/web, +13/−5 lines plus a new module):**
  - `src/lib/parity-mode.ts`: `parityOverride()` and `stripeParityOptions()`; it throws if `PARITY_MODE=1` in production.
  - `lib/auth/mail.ts`, `lib/project-lifecycle-email.ts`: `fetch(parityOverride("POSTMARK_API_URL") ?? POSTMARK_API_URL)`.
  - `lib/storage/r2.ts`: the `R2_ENDPOINT` override plus `forcePathStyle` when set.
  - `lib/stripe.ts`, `app/api/admin/health/route.ts`: `...stripeParityOptions()` (host, port, protocol from `STRIPE_API_BASE`).
- **Deviations:** none (test-only, inert by default).
- **Tests:** `src/lib/parity-mode.test.ts` (4: inert, override, Stripe mapping, refused in production).
- **Evidence (2026-11-18):** the 4 new tests pass. `npm run test`: 104 files / **726 passed**, 20 skipped (baseline 722 + 4). Typecheck ✓. ESLint on the touched files ✓.
- **Gotchas:** the R2 account-ID regex still applies in parity mode, so the test env must supply a 32-hex dummy `R2_ACCOUNT_ID`.
- **Docs:** inventory O-09 (Laravel column → test ref), DECISIONS 2026-11-18 (seams approved under the freeze rule), sprint-status.
- **Open items:** the seed script (0.4). End-to-end use against stripe-fake, postmark-shim and SeaweedFS (0.4/0.5).
