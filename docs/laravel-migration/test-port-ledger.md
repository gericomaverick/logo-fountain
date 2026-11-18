# Test-port ledger

Every existing Next.js test file, the inventory rows it protects, and where its intent lives after the port. Generated 2026-11-18 from `apps/web` (110 files; the counts are `it(`/`test(` occurrences, so `.each` tables count once).

**Rules:** a row is resolved only when its destination tests exist and pass, and the story that resolves it fills in the Laravel test path. "Keep TS (UI)" means the module and its Vitest file move into `apps/portal/resources/js` unchanged and keep running in CI. Every route test also gets **L4 parity contract** coverage, which runs against both apps.

| # | Next.js test file | Tests | Inventory | Destination | Laravel test(s) | Status |
|---|---|---|---|---|---|---|
| 1 | `e2e-golden/auth-golden.spec.ts` | 5 | A-01,A-05,A-06,A-08 | L5 parity | | Not started |
| 2 | `e2e/client-flows.spec.ts` | 4 | C-01,C-03,C-05 | L5 parity | | Not started |
| 3 | `e2e/smoke.spec.ts` | 2 | A-15 | L5 parity @smoke | | Not started |
| 4 | `src/app/admin/projects/[id]/concepts/read-state-regression.test.ts` | 2 | C-15,D-05 | Keep TS (UI) + L4 read-state contract | | Not started |
| 5 | `src/app/api/admin/checkout/reprocess/route.test.ts` | 5 | K-12 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 6 | `src/app/api/admin/health/route.test.ts` | 5 | D-18 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 7 | `src/app/api/admin/projects/[id]/audit/route.test.ts` | 3 | D-16 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 8 | `src/app/api/admin/projects/[id]/concepts/[conceptId]/publish/route.test.ts` | 5 | D-06 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 9 | `src/app/api/admin/projects/[id]/concepts/[conceptId]/route.test.ts` | 8 | D-07 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 10 | `src/app/api/admin/projects/[id]/concepts/route.test.ts` | 15 | D-05,X-13 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 11 | `src/app/api/admin/projects/[id]/entitlements/reset/route.test.ts` | 2 | D-14 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 12 | `src/app/api/admin/projects/[id]/entitlements/route.test.ts` | 6 | D-14 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 13 | `src/app/api/admin/projects/[id]/finals/download/route.test.ts` | 6 | D-13 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 14 | `src/app/api/admin/projects/[id]/finals/notify/route.test.ts` | 9 | D-12 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 15 | `src/app/api/admin/projects/[id]/finals/route.test.ts` | 14 | D-11 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 16 | `src/app/api/admin/projects/[id]/invoices/route.test.ts` | 2 | D-19 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 17 | `src/app/api/admin/projects/[id]/reset/route.test.ts` | 4 | D-15 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 18 | `src/app/api/admin/projects/[id]/revision-requests/[rid]/delivered/route.test.ts` | 4 | D-09 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 19 | `src/app/api/admin/projects/[id]/revision-requests/route.test.ts` | 3 | D-08 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 20 | `src/app/api/admin/projects/[id]/route.test.ts` | 4 | D-02 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 21 | `src/app/api/admin/projects/[id]/status/route.test.ts` | 6 | D-03 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 22 | `src/app/api/admin/projects/route.test.ts` | 4 | D-01 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 23 | `src/app/api/auth/forgot-password/route.test.ts` | 3 | A-07 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 24 | `src/app/api/auth/login/route.test.ts` | 10 | A-01 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 25 | `src/app/api/auth/logout/route.test.ts` | 2 | A-02 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 26 | `src/app/api/auth/magic-link/route.test.ts` | 3 | A-05 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 27 | `src/app/api/auth/magic-link/verify/route.test.ts` | 3 | A-05 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 28 | `src/app/api/auth/password/route.test.ts` | 4 | A-09 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 29 | `src/app/api/auth/reset-password/route.test.ts` | 3 | A-08 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 30 | `src/app/api/auth/session/route.test.ts` | 3 | A-03 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 31 | `src/app/api/checkout/magic-link/route.test.ts` | 4 | K-03 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 32 | `src/app/api/checkout/resend-magic-link/route.test.ts` | 1 | K-04 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 33 | `src/app/api/checkout/status/route.test.ts` | 3 | K-02 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 34 | `src/app/api/invoices/route.test.ts` | 2 | K-11 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 35 | `src/app/api/profile/route.test.ts` | 4 | C-17 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 36 | `src/app/api/projects/[id]/approve/route.test.ts` | 1 | C-12 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 37 | `src/app/api/projects/[id]/brief/draft/route.test.ts` | 11 | C-06 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 38 | `src/app/api/projects/[id]/brief/route.test.ts` | 4 | C-07 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 39 | `src/app/api/projects/[id]/checkout/session/route.test.ts` | 2 | K-08 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 40 | `src/app/api/projects/[id]/concepts/[conceptId]/assets/route.test.ts` | 4 | C-09 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 41 | `src/app/api/projects/[id]/concepts/[conceptId]/comments/route.test.ts` | 3 | C-10 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 42 | `src/app/api/projects/[id]/concepts/route.test.ts` | 4 | C-08 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 43 | `src/app/api/projects/[id]/entitlements/route.test.ts` | 4 | C-16 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 44 | `src/app/api/projects/[id]/finals/route.test.ts` | 7 | C-13 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 45 | `src/app/api/projects/[id]/invoices/route.test.ts` | 2 | K-11 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 46 | `src/app/api/projects/[id]/messages/route.test.ts` | 2 | C-14 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 47 | `src/app/api/projects/[id]/read-state/route.test.ts` | 3 | C-15 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 48 | `src/app/api/projects/[id]/revision-requests/route.test.ts` | 3 | C-11 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 49 | `src/app/api/projects/[id]/route.test.ts` | 5 | C-02 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 50 | `src/app/api/projects/route.test.ts` | 1 | C-02 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 51 | `src/app/api/route-guards.test.ts` | 7 | X-01 | Pest arch test: every mutating route has OriginGuard middleware + L6 matrix | | Not started |
| 52 | `src/app/api/stripe/webhook/route.test.ts` | 21 | K-05,K-06 | Pest feature (HTTP) + L4 parity contract | | Not started |
| 53 | `src/app/project/[id]/brief/brief-feedback.test.ts` | 10 | C-05,C-06 | Keep TS (UI) | | Not started |
| 54 | `src/app/project/[id]/brief/editor-focus.test.ts` | 2 | C-05 | Keep TS (UI) | | Not started |
| 55 | `src/components/allowances.test.ts` | 5 | C-03 | Keep TS (UI) | | Not started |
| 56 | `src/components/auth-shell.test.ts` | 1 | A-01 | Keep TS (UI) | | Not started |
| 57 | `src/components/brief-document.test.ts` | 2 | D-04 | Keep TS (UI) | | Not started |
| 58 | `src/components/brief-field-input.test.ts` | 3 | C-05 | Keep TS (UI) | | Not started |
| 59 | `src/components/brief-progress.test.ts` | 2 | C-05 | Keep TS (UI) | | Not started |
| 60 | `src/components/header-nav.test.ts` | 4 | A-02,C-19 | Keep TS (UI) | | Not started |
| 61 | `src/lib/__tests__/safe-performance-measure.test.ts` | 3 | C-19 | Keep TS (UI) | | Not started |
| 62 | `src/lib/admin-audit.test.ts` | 3 | D-16 | Keep TS (UI) | | Not started |
| 63 | `src/lib/admin-dashboard.test.ts` | 4 | D-01 | Keep TS (UI) + Pest for controller sort | | Not started |
| 64 | `src/lib/admin-final-publication.test.ts` | 6 | D-11,D-12 | Keep TS (UI) | | Not started |
| 65 | `src/lib/admin-override-inputs.test.ts` | 2 | D-14 | Keep TS (UI) | | Not started |
| 66 | `src/lib/auth.postgres.integration.test.ts` | 12 | A-01…A-11 | L3 Pest real-PG (1:1) | | Not started |
| 67 | `src/lib/auth/client-address.test.ts` | 7 | X-05 | Pest unit | | Not started |
| 68 | `src/lib/auth/client.test.ts` | 2 | A-05 | Keep TS (UI) | | Not started |
| 69 | `src/lib/auth/http.test.ts` | 3 | A-01…A-09 | Pest feature (auth wrapper) | | Not started |
| 70 | `src/lib/auth/logout.test.ts` | 5 | A-02 | Keep TS (UI) | | Not started |
| 71 | `src/lib/auth/safe-next.test.ts` | 4 | A-13 | Pest unit + keep TS (shared fixture) | | Not started |
| 72 | `src/lib/auth/validation.test.ts` | 6 | A-07…A-09 | Keep TS (UI) + Pest rule | | Not started |
| 73 | `src/lib/brief-choices.test.ts` | 25 | C-05 | Keep TS (UI) | | Not started |
| 74 | `src/lib/brief-draft.test.ts` | 5 | C-06 | Keep TS (UI) | | Not started |
| 75 | `src/lib/brief-submission-confirmation.test.ts` | 6 | C-07 | Keep TS (UI) | | Not started |
| 76 | `src/lib/brief-wizard.test.ts` | 5 | C-05 | Keep TS (UI) | | Not started |
| 77 | `src/lib/brief.test.ts` | 3 | C-05,C-07 | Pest unit + keep TS (shared fixture) | | Not started |
| 78 | `src/lib/chat-messages.test.ts` | 14 | C-14 | Keep TS (UI) | | Not started |
| 79 | `src/lib/checkout-auth-email-rate-limit.test.ts` | 3 | K-04,X-06 | Pest unit (shared-store limiter) | | Not started |
| 80 | `src/lib/checkout-fulfillment.test.ts` | 6 | K-06,K-09 | Pest feature | | Not started |
| 81 | `src/lib/checkout-success.test.ts` | 2 | K-02 | Keep TS (UI) | | Not started |
| 82 | `src/lib/client-invoices.test.ts` | 4 | K-11 | Pest unit (Stripe fakes) | | Not started |
| 83 | `src/lib/concept-activity.test.ts` | 2 | C-15 | Pest unit + keep TS | | Not started |
| 84 | `src/lib/concept-entitlement.test.ts` | 4 | K-14,D-05 | Pest feature | | Not started |
| 85 | `src/lib/concept-thread.test.ts` | 2 | C-10 | Keep TS (UI) | | Not started |
| 86 | `src/lib/concept-upload-request.test.ts` | 2 | D-05,X-13 | Pest unit | | Not started |
| 87 | `src/lib/database-target.test.ts` | 5 | O-06 | Pest unit | | Not started |
| 88 | `src/lib/email-branding.test.ts` | 5 | N-14 | Pest unit (mail view) | | Not started |
| 89 | `src/lib/entitlements.test.ts` | 3 | K-07 | Pest unit | | Not started |
| 90 | `src/lib/final-approval.test.ts` | 2 | C-12 | Keep TS (UI) | | Not started |
| 91 | `src/lib/final-deliverable-access.test.ts` | 2 | C-13 | Pest unit | | Not started |
| 92 | `src/lib/final-deliverable-filename.test.ts` | 2 | C-13,X-11 | Pest unit | | Not started |
| 93 | `src/lib/local-dev-extra-project.test.ts` | 1 | O-02 | Pest (seed command) | | Not started |
| 94 | `src/lib/local-dev-seed.test.ts` | 1 | O-02 | Pest (seed command) | | Not started |
| 95 | `src/lib/magic-link-email.test.ts` | 3 | K-03,A-11 | Pest feature | | Not started |
| 96 | `src/lib/postgres.integration.test.ts` | 6 | K-05,K-06,X-09 | L3 Pest real-PG (1:1) | | Not started |
| 97 | `src/lib/project-display-name.test.ts` | 5 | C-01,K-11 | Pest unit + keep TS | | Not started |
| 98 | `src/lib/project-hub.test.ts` | 12 | C-03,C-04 | Keep TS (UI) | | Not started |
| 99 | `src/lib/project-journey.test.ts` | 10 | C-03 | Keep TS (UI) | | Not started |
| 100 | `src/lib/project-lifecycle-email.test.ts` | 10 | N-04…N-12 | Pest feature (Mail::fake + marker dedupe) | | Not started |
| 101 | `src/lib/project-overview.test.ts` | 9 | C-03 | Keep TS (UI) | | Not started |
| 102 | `src/lib/project-snapshot.test.ts` | 3 | C-02,C-03 | Pest feature + L4 snapshot contract | | Not started |
| 103 | `src/lib/project-state-machine.test.ts` | 6 | X-07 | Pest unit + keep TS (shared fixture) | | Not started |
| 104 | `src/lib/project-status.test.ts` | 10 | X-07,C-03 | Pest unit | | Not started |
| 105 | `src/lib/request-origin.test.ts` | 15 | X-01,X-04 | Pest unit + feature | | Not started |
| 106 | `src/lib/storage/r2.test.ts` | 10 | X-10,X-11 | Pest unit (S3 mock) + L3 MinIO | | Not started |
| 107 | `src/lib/system-messages.test.ts` | 2 | N-15 | Pest feature | | Not started |
| 108 | `src/lib/upload-validation.test.ts` | 12 | X-12 | Pest unit + shared golden corpus | | Not started |
| 109 | `src/lib/webhook-error-classification.test.ts` | 2 | K-05 | Pest unit | | Not started |
| 110 | `src/lib/zip-validation.test.ts` | 8 | X-12 | Pest unit + shared golden corpus | | Not started |

Total: 110 files, 560 counted test declarations (Vitest reports 614 executed tests including `.each` expansions).
