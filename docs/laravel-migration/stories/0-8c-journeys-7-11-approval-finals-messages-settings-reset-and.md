# Story 0.8c: Journeys 7–11: approval, finals, messages, settings, reset and logout

Status: done

**Covers:** C-12…C-15, C-17, C-18, K-11, A-02, A-03, A-07…A-09, N-03, N-06…N-09, N-11, D-11 (API leg), DV-14 · **Gate:** `@approval&@ui`, `@finals&@ui`, `@messages&@ui`, `@settings&@ui` · **After:** 0.8a · **DoD:** E0

## Delivered (`tests/parity/`)
- **Page-object interfaces** (new files, each with its own resolver; fit the Next screens and ux-design.md §5.1/§7):
  - `pages/approval.ts`: `openConcept(n)`, `approveOpenConcept()` → `{confirmBlockedUntilAcknowledged}`.
  - `pages/finals.ts`: `finalFilesOffered()`, `downloadFinalFiles()` → `{filename, bytes}` (Overview banner or Files tab).
  - `pages/messages.ts`: `open()`, `send(text)`, `thread()` → `MessageEntry[]` (`system` | `message` with `mine`).
  - `pages/settings.ts`: `SettingsPages` (`open`, `profileName`, `updateName`, `invoices` → `InvoiceRow[]`, `changePassword`) and `AccountPages` (`requestPasswordReset`, `signOut`, `showsSignedInContent`).
  - `pages/index.ts`: export lines only (after 0.8b's block).
- **Implementations:** `pages/next/{approval,finals,messages,settings}.ts`. Laravel typed stubs are in `pages/laravel/{approval,finals,messages,settings}.ts` (stories 6.7, 6.9, 6.10, 6.11, 6.12, 4.9b).
- **Folded onto 0.8b (merge of main):** 0.8b's Next `thread.systemMessages()` now reads through `pages/next/messages.ts` (one reader of the messages screen), and `approval.openConcept` uses 0.8b's `concepts.openGallery/openConcept`. `projectIdIn` comes from `next/project-areas.ts`. The 0.8c type is called `MessageEntry` because 0.8b's concepts `ThreadEntry` keeps that name.
- **Journeys** (`@ui`): `journeys/j7-approval-finals.spec.ts` (exclusive, seeds `concepts-ready`), and `j8-messages`, `j9-settings`, `j10-password-reset`, `j11-logout` (shared `awaiting-brief`, a fresh customer each). The shared arrangement is in `journeys/_j7-j11-helpers.ts` (`freshCustomer`, `oneNew` = exactly one new mail with a subject, `LIFECYCLE` subjects).
  - J7: approve is refused until the acknowledgement is ticked → N-07 and N-08 once each, with the CTA links → the finals ZIP is uploaded through the admin API → N-09 → the browser download matches the uploaded bytes and is named `ada-client-{UTC date of upload}.zip` → `DELIVERED`, nobody's turn, and the files are still offered.
  - J8: client message → N-11 (link `/admin/projects/{id}/messages`), then brief submit, then a second message. The thread reads `[mine, system "Brief received…", mine]`. The **DV-14 deviation** (`expected-next-failures.txt`): the admin reply must be 201, followed by N-06 (link `/project/{id}/messages`), with the reply shown after the system line. On Next it fails at the 201 assertion with **500** (checked with an empty expected-failures list).
  - J9: renaming persists (screen + `/api/profile`). The invoices page has one row: "Your logo project", `£x.xx`, "Paid", and a stripe-fake document link that answers 200. A password change signs out this browser **and** a second browser that signed in earlier. The old password fails and the new one works.
  - J10: two reset requests (uniform notice each time) → the newer fragment link resets the password in the browser → no session is created. An API session and a second browser from before are dead, **both** reset tokens are dead, and the new password signs in.
  - J11: sign out → the session endpoint says anonymous, and replayed pre-logout cookies are anonymous with 401 on the project API. Back through the history and direct visits to `/project/{id}`, `/project/{id}/messages`, `/dashboard` and `/settings` show no signed-in content.
  - J10 and J11 are also tagged `@settings` (account area), so the `@settings&@ui` gate runs them.

## Evidence (2026-11-19, isolated stack `-p lf08c`: PG 55590, SMTP 51190, Mailpit 58190, S3 58390, shim 58191, fake 58192 with `STRIPE_FAKE_PUBLIC_URL`; Next 16.4 `next dev --webpack` on 127.0.0.1:4390 + forwarder 4391)
| Run | Result |
|---|---|
| `@approval&@ui` | 1/1 (`--repeat-each=2`: 2/2, after the 0.8b fold) |
| `@finals&@ui` | 1/1 |
| `@messages&@ui` | 2/2 (1 = the DV-14 expected Next failure) |
| `@settings&@ui` | 3/3 |
| All four gates, `--repeat-each=2` | **12 passed**, 0 failed (1.8 min) |
| Every `@ui` journey after merging main (J1–J11, 0.8b included) | **14 passed**, 0 failed |
- `npm run check`: OK (39 spec files, 232 titles, 17 expected failures). Strict `tsc` (apps/web's TypeScript, `--noUnusedLocals`) is clean for `journeys/j*.spec.ts`, `pages/next/*`, `pages/laravel/*`.

## Next behaviour worth knowing
1. **Chromium reports the final-ZIP download on the opener page**, before the `window.open` tab appears (`app/project/[id]/project-hub.tsx:314`). `pages/next/finals.ts` listens on both.
2. **The reset email's text part has no lifetime copy** (`lib/auth/mail.ts:25-27`). "single-use link within one hour" is in the HTML only (`:32`). The setup email has it in both. J10 asserts the HTML.
3. After approval, the hub badge shows the display-only **"Approved"** (`overviewStatus`), which `portal.projectStatus()` doesn't map. J7 reads `AWAITING_APPROVAL` from the snapshot API at that step.
4. The finals filename brand is `project.client.name` ("Ada Client" → `ada-client`), and the date is the asset's UTC `createdAt` (`app/api/projects/[id]/finals/route.ts:117`, `lib/final-deliverable-filename.ts:40`).
5. Anonymous, `/project/{id}/messages` (a client page, no server guard) still renders its empty shell with "Unauthorized — Sign in and retry.". It shows no data. Back after logout lands on that URL showing the sign-in screen. Breadcrumbs are built from the URL, so `showsSignedInContent` ignores them.
6. Before hydration (first dev compile), `/forgot-password` submits natively as `GET /forgot-password?`, so nothing is sent. The page object retries. This is dev-only.
7. `page.goBack()` returns `null` for Next client-side history entries, so J11 detects movement by URL.
8. Item 9's "VAT number" variant has nothing to drive: no VAT field exists (C-17, F-3).

## Open items
- **Parent:** set the inventory status for C-12…C-15, C-17, C-18, K-11, A-02, A-03, A-07…A-09, N-03, N-06…N-09 and N-11 (L5 journeys exist; N-06 and the D-17 reply only as DV-14 until Laravel), and copy Next points 1–5 into `brownfield/ui-pages.md` (point 2 into `auth-and-security.md` §11).
- The admin **screen** for replying (D-17) and uploading finals (D-11) belongs to 0.8d. J7 and J8 use the admin API there.
- `push` was denied to sub-agents. Commits are local on `story/0-8c-journeys-7-11` for the parent to cherry-pick.


## Parent review (2026-11-19)
Fast-forwarded main to `94e89a8` and pushed. `npm run check` OK (39 specs, 17 expected failures). Surprises copied into `brownfield/ui-pages.md`.
