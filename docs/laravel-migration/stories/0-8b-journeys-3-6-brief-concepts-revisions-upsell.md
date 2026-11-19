# Story 0.8b: Journeys 3–6: brief, concepts, revisions, upsell

Status: done

**Covers:** C-03…C-11, K-08…K-10, K-14, N-04, N-05, N-12, N-13, N-15, D-06, D-09 · **Gate:** `@brief&@ui`, `@concepts&@ui`, `@revisions&@ui`, `@upsell&@ui` · **After:** 0.8a · **DoD:** E0

## Delivered (`tests/parity/`)
- **Page-object interfaces** (new files, fit both the Next screens and ux-design.md §5/§7):
  - `pages/brief.ts`: `BriefPages` (`open`, `fill`, `next`, `waitUntilSaved`, `shownAnswers`, `reload`, `submit`) and `ProjectThreadPages.systemMessages()`.
  - `pages/concepts.ts`: `ConceptPages` (`hasNewConcepts`, `openGallery`, `openConcept`, `shownImage`, `comment`, `requestRevision`, `thread`, `allowance`).
  - `pages/upsell.ts`: `UpsellPages` (`offer`, `snooze`, `buy`, `waitForPurchaseConfirmed`).
- **Implementations:** `pages/next/{brief,concepts,upsell,project-areas}.ts`. `pages/laravel/areas-0-8b.ts` holds typed stubs for stories 6.2b, 6.3–6.8 and 6.10.
- **Registration:** `pages/index.ts` gets appended exports plus a `PageObjects` declaration merge. `next/index.ts` and `laravel/index.ts` each get a one-line import and spread, marked `// 0.8b`.
- **Journeys.** All use `test.use({ db: "exclusive" })` and seed their own scenario.
  - `j3-brief.spec.ts` (awaiting-brief):
    - The brief autosaves to the account (and the draft API agrees).
    - The answers come back after a reload and in a fresh tab with no sessionStorage.
    - Submit goes through the dialog checkbox. The project ends `BRIEF_SUBMITTED` on the studio's turn, with brief v1 and the draft cleared.
    - The thread shows "Brief received…". Zero emails go to the client or the admin (N-13).
  - `j4-concepts.spec.ts` (brief-submitted):
    - The admin API uploads a 2×2 PNG, and exactly one N-04 email arrives, with a `/project/{id}/concepts` CTA.
    - The project shows "New", is `CONCEPTS_READY` and is the client's turn.
    - In the gallery and concept view, the image loads with `naturalWidth` 2. It comes from the object store with a 200, carries a SigV4 `X-Amz-Signature`, and its bytes equal the upload.
    - The "New" flag clears after the visit, and the thread shows "Concept 1 is ready for review.".
  - `j5-feedback-revisions.spec.ts` (concepts-ready):
    - A comment appears in the thread, and no email goes to the admin.
    - A revision request shows in the thread as `requested`, with the allowance at 2/0 used/1 pending/1 left. The project is `REVISIONS_IN_PROGRESS`, and exactly one N-12 email goes to the admin.
    - The admin API marks it delivered: 1 used, 0 pending, `CONCEPTS_READY`, exactly one N-05 email to the client, and the thread shows `delivered`.
    - Both system messages appear.
  - `j6-upsell.spec.ts`, two tests on revisions-exhausted:
    - **Add-on:** the prompt offers add-on £95 and upgrade to Professional £495. Payment goes through the stripe-fake hosted page, and the banner polls until "Purchase confirmed". The revisions allowance becomes 2 (1 used), the prompt then offers only the upgrade, and "Not now" hides it, including on a fresh load.
    - **Upgrade:** the same purchase flow. Concepts and revisions are set to Professional's 2/2, used counts are kept, and `packageCode` is `professional`. The prompt then offers the upgrade to Complete £750, and "Not now" hides it.
- **Storage adapter:** not needed. J4 checks the signed GET the browser actually made, including its bytes.

## Evidence (2026-11-19, isolated stack `-p lf08b`, Next 16.4 `next dev --webpack` on 127.0.0.1:4380 plus a forwarder on :4381)
| Run | Result |
|---|---|
| `@brief&@ui` | 1/1 |
| `@concepts&@ui` (J4, J5) | 2/2 |
| `@revisions&@ui` (J5, J6×2) | 3/3 |
| `@upsell&@ui` | 2/2 |
| All four gates, one run, default workers | 5/5 (2.0 min); `--repeat-each=2`: 10/10 |
- `npm run check`: OK (34 specs, 226 titles, 16 expected failures). A strict `tsc` pass over the new files is clean.
- **Stack gotcha:** stripe-fake builds hosted-page URLs from `STRIPE_FAKE_PUBLIC_URL`, which defaults to port 58091 (`infra/docker-compose.test.yml:112`). On a stack with other ports, set it to the `PARITY_STRIPE_PORT` URL. Otherwise `buy()` lands on a dead port.

## Next behaviour worth knowing
1. **Clients have no comment composer.** Concept detail shows clients only the revision form; the reply form is admin-only (`app/project/[id]/concept/[conceptId]/page.tsx:496-535`). `POST …/comments` is open to members, so `next/concepts.ts` `comment()` posts it with the browser session and reloads. ux-design.md §7 adds the composer in Laravel: same API, so this is not a deviation.
2. The concept page shows "Feedback sent." before its refresh lands (`page.tsx:156-157`), so `requestRevision()` also waits for the thread entry.
3. **Comments send no email, to anyone** (`api/projects/[id]/concepts/[conceptId]/comments/route.ts`). Test strategy §4 item 5 says "admin gets the email"; that is wrong and should read "no email". Item 3's "admin email" is also contradicted by N-13.
4. **The brief has two save copies.**
   - sessionStorage (`brief-form.tsx:279`) plus a serialised PUT. A reload restores from sessionStorage, so only a fresh tab proves the account draft.
   - The sr-only live region announces only the first "saved" (`brief-form.tsx:102-107`). `waitUntilSaved()` reads the visible line `[data-brief-save]`.
   - There is a `beforeunload` warning whenever answers differ from the submitted brief (`brief-form.tsx:299-309`).
5. **Choice buttons' accessible names run the hint into the value** ("Wordmark· Your name…", `components/brief-field-input.tsx:97-98`), with no space.
6. **Two purchase buttons.** The upsell panel (`project-hub.tsx:88-153`) can be snoozed. The allowances card's "Need more?" footer (`components/revision-purchase.tsx:173`) always offers the same purchases, with slightly different copy ("Buy an extra revision"). `upsell.*` drives the panel.
7. The hub's new-concepts flag counts comments (snapshot rule), but the dashboard's "New concepts" badge doesn't (`app/dashboard/page.tsx:106`). `hasNewConcepts()` reads the hub.

## Open items
- **Parent:**
  - Update inventory Tests/status for C-03…C-11, K-08…K-10, K-14, N-04, N-05, N-12, N-13, N-15, D-06, D-09.
  - Copy Next points 1, 3, 4 and 6 into `brownfield/ui-pages.md`.
  - Fix test strategy §4 items 3 and 5 (emails).
- **Merging:** the parent resolves the `pages/index.ts` append and the one-line `next/index.ts`/`laravel/index.ts` registrations against the other 0.8 agents. `thread.systemMessages()` may fold into 0.8c's messages object.
- **DV-2's distinguishing case belongs to 0.8e.** That is add-on then upgrade: Next gives 2, DV-2 gives 3. J6's upgrade starts without an add-on, so both semantics agree there.
- Not exercised: the delayed-webhook "Purchase confirmation delayed" state and refreshing during an upsell return (K-10 edges); 0.8e or 6.4.


## Parent review (2026-11-19)
Cherry-picked 5 commits to main and pushed (the agent's branch push was denied by the permission system, so it went via main instead). `npm run check` OK (34 specs). Surprises copied into `brownfield/ui-pages.md`, and test strategy §4 items 3 and 5 corrected. Gotcha: on any stack with non-default ports, set `STRIPE_FAKE_PUBLIC_URL`.
