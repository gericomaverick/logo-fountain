# Story 1.8c: Media, data components and `usePolling`

**Status:** review (2026-11-20) · **DoD variant:** Laravel-only · **Epic:** 1 · **Covers:** UX §11, FR58, ADR-023 (+ ADR-021 stable image) · **Gate:** `@visual`, `@unit` · **After:** 1.8a
**Branch:** `worktree-agent-a6f1802c1659e5aa3` (not pushed) · **Stack:** `COMPOSE_PROJECT_NAME=lf-1-8c`, HTTP 18092, Vite 15182

## Acceptance criteria (epics.md §1.8c)
1. Concept card and viewer, File card, Upload dropzone (all states, limits shown), Thread, Data table, Properties panel.
2. (Added 2026-11-20) A generic Card/Panel, and Tabs (Radix, roving focus and arrow keys, a "new" dot badge per UX §5).
3. `usePolling`: 3 consecutive failures → a non-blocking "Reconnecting…" notice, polling continues with backoff; a hidden tab pauses; new items are announced via `aria-live=polite` without moving focused content (fake-timer unit tests).

## Inventory scope
No inventory row completes here (presentational components, no endpoints). Feeds C-02/D-02/D-16/K-02 (polling, via FR58) and C-19; those rows complete with their screens (Epics 5–7).

## Next.js source read
- Polling: `apps/web/src/app/project/[id]/project-hub.tsx:170-275` (hub 10 s `setInterval`; upsell status 2.5 s then 7 s, stops on failure), `apps/web/src/app/admin/projects/[id]/page.tsx:170-180` (admin project 2 s), `apps/web/src/app/admin/projects/[id]/audit/page.tsx:40-60` (audit 2.5 s), `apps/web/src/app/checkout/success/success-processing-client.tsx:15-17,44-80` (2 s, 10 s after 45 s, stops on fulfilled or error).
- Upload limits: `apps/web/src/lib/upload-validation.ts:4-9,170-196` (codes), `apps/web/src/lib/zip-validation.ts` (`MALFORMED_ZIP`, `ZIP_LIMIT_EXCEEDED`), `apps/web/src/lib/concept-upload-key.ts` (request-key persistence; not ported here). File inputs: `apps/web/src/app/admin/projects/[id]/concepts/page.tsx:239` (`accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"`).
- Thread: `apps/web/src/lib/chat-messages.ts` (`resolveSenderLabel`, `groupMessagesByDay`, `shouldSendOnKey`), `lib/message-kind.ts`.
- Docs: epics §1.8a–1.9 + DoD, ux-design §5, §7, §8, §11–§13, §16, prd FR58, ADR-021/022/023, 02-test-strategy L1/L7/L7a, brownfield `storage-and-uploads.md` §2–3, `index.md` F-15, inventory X-12 and DV-13, story 1.8a record, AGENTS.md §8.

## Behaviour notes (written before converting)
**Polling in Next (no shared hook exists):**
| Screen | Interval | On error | Hidden tab | Source |
|---|---|---|---|---|
| Customer hub | 10 000 ms `setInterval`; first poll 10 s after SSR data | sets an error string, keeps polling at 10 s | keeps polling | `project-hub.tsx:269` |
| Upsell status (hub) | 2 500 ms once, then 7 000 ms `setTimeout` chain | **stops** ("Refresh the page in a moment") | keeps polling | `project-hub.tsx:193` |
| Admin project | 2 000 ms `setInterval`, immediate first tick | error string, keeps polling | keeps polling | `admin/projects/[id]/page.tsx:178` |
| Admin audit | 2 500 ms `setInterval`, immediate first tick | error string, keeps polling | keeps polling | `audit/page.tsx:57` |
| Checkout success | 2 000 ms, 10 000 ms once 45 000 ms have passed (`FAST_POLL_INTERVAL_MS`, `SLOW_POLL_INTERVAL_MS`, `TROUBLESHOOTING_TIMEOUT_MS`) | **stops** with the message; "Retry now" restarts | keeps polling | `success-processing-client.tsx:15-17,66-71` |
Next has **no backoff, no visibility pause, no announcements**, and `setInterval` can overlap slow requests. All of that is new in the hook (ADR-023, UX §12), DV-UX.

**Upload limits Next enforces (shown up front by the dropzone):** concept image ≤ `10 * MIB` bytes (Next's own message says "10 MB"), ≤ 40 000 000 pixels, extension `png|jpg|jpeg|webp` **and** a matching MIME (`image/png|jpeg|webp`). Final ZIP ≤ **95 000 000 bytes in Laravel (DV-13**; Next 100 MiB), `.zip` + `application/zip` or `application/x-zip-compressed`, ≤ 1000 entries, ≤ 500 MiB uncompressed, ratio ≤ 100. Codes: `FILE_REQUIRED`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `FILE_SIGNATURE_MISMATCH`, `MALFORMED_IMAGE`, `IMAGE_DIMENSIONS_TOO_LARGE`, `MALFORMED_ZIP`, `ZIP_LIMIT_EXCEEDED`. The dropzone pre-checks size, extension and MIME in the browser (the same rules, so the user hears the limit before uploading); structure and pixels stay server-side (story 7.x).

**Stable image rule (ADR-021, F-15):** keep the rendered `src` while `imageKey` is unchanged, unless the current URL is ≤ 5 min from expiry; a new key swaps immediately. "Preview unavailable" when there is no URL or it fails to load. Fixed aspect-ratio boxes.

**Thread:** sender label "You" for the viewer, the designer's name for admins (`resolveSenderLabel`); days are "Today", "Yesterday", else `en-GB` long dates (`groupMessagesByDay`). Enter sends; Shift/Ctrl/Cmd/Alt+Enter and IME composition don't (`shouldSendOnKey`). System messages are centred lines, not bubbles (UX §11).

## Components vs the spec list (all in `apps/portal/resources/js/Components/ui/`)
| Item (epics / UX §11) | Variants and states built | File |
|---|---|---|
| Card / Panel | Card default · interactive (`CardLink` stretched target) · selected (`aria-current`); Panel title/description/actions/footer, surface · sunken; `LoadingBlock` placeholder | `Card.tsx` |
| Tabs★ (Radix) | top · bottom bar (icon above label); roving focus, arrows/Home/End, automatic activation, disabled skipped; "new" dot (`aria-hidden`) + name "Concepts, new" (`aria-label` starting with the visible label) | `Tabs.tsx` |
| Concept card | thumbnail (4:3, stable image), Concept n / Version v, New label, approved / archived (icon + text), note, selected; `ConceptGallery`: ready · loading · error + retry · empty · partial (preview unavailable) | `ConceptCard.tsx`, `PrivateImage.tsx` |
| Concept viewer | versions as single-choice chips (arrow keys, newest first, date in the label); zoom dialog (Radix: focus trap, Esc, focus back to Zoom; "Actual size" `aria-pressed`; scrollable focusable region); no versions; no image (no Zoom) | `ConceptViewer.tsx` |
| Stable image (ADR-021) | keeps `src` while `imageKey` is unchanged; swaps on a new key or ≤ 5 min to expiry (`expiresAt` or `X-Amz-Date`+`X-Amz-Expires`); "Preview unavailable" on no URL or a load error | `PrivateImage.tsx`, `lib/media.ts` `stableImage` |
| File card | final ZIP (primary "Download ZIP") · invoice · receipt; ready · downloading ("Preparing download…") · not available (`disabledReason`) · error (InlineAlert) · placeholder | `FileCard.tsx` |
| Upload dropzone | idle · drag-over · validating · uploading (labelled `progressbar`, % and bytes, Cancel) · error (code → plain language, `role=alert`) · done · disabled with reason; the limits are always shown and linked to the button | `UploadDropzone.tsx`, `lib/media.ts` |
| Thread | you / designer / other bubbles, system lines, day headings (Next's `groupMessagesByDay`), sending, failed + "Try again"; loading · error (messages kept) · empty; `ThreadComposer` (Enter sends, Shift+Enter newline, an empty message says why) | `Thread.tsx`, `lib/chat-messages.ts` |
| Data table | caption, sortable headers (`aria-sort`, natural sort, empty last), reason chips, roving row focus (↑ ↓ Home End, Enter opens); loading · error (rows kept) · empty · partial note; scrolls sideways on phones | `DataTable.tsx` |
| Properties panel | `<dl>` on sunken, mono values, "Not set", inline edit (focus in and back, Esc cancels, Saving…, an error keeps the input); loading · error | `PropertiesPanel.tsx` |
| `usePolling` | below; `PollingStatus` renders "Reconnecting…" (`role=status`, Retry now) and the always-present `aria-live=polite` announcer | `hooks/usePolling.ts`, `lib/polling.ts`, `PollingStatus.tsx` |

## Laravel implementation
| Piece | Where |
|---|---|
| Polling engine (framework-free; injectable visibility and clock): `createPoller`, `POLL_INTERVALS`, `checkoutInterval`, `nextDelay`, `countNewIds`, `newItemsAnnouncement` | `resources/js/lib/polling.ts` |
| React hook (latest closures via a ref; restarts on `key` or interval; the announcement is cleared, then set, and kept 5 s) | `resources/js/hooks/usePolling.ts` |
| Upload rules and messages, byte/date formatting, stable image, table sort and row keys | `resources/js/lib/media.ts` |
| Next `chat-messages.ts`, ported unchanged (one header line added) | `resources/js/lib/chat-messages.ts` |
| Catalogue page (fixed "today", generated fixtures) | `resources/js/Pages/Dev/UiMedia.tsx`, `Pages/Dev/fixtures/*.png` (1.3–6.2 KB, from `make-concepts.py`) |
| Route, inside the local/testing-only block | `apps/portal/routes/web.php:27-28` |
| Pin: `@radix-ui/react-tabs 1.2.1` (released 2026-10-12; `--save-exact`; `npm audit --omit=dev` 0) | `package.json`, `package-lock.json` (`4be186f`) |

**Polling values used:**
- **Intervals, as in Next:** customer 10 000 ms, admin 2 000, audit 2 500, checkout 2 000 → 10 000 after 45 000, upsell 2 500 then 7 000. Sources are in the Behaviour notes.
- **New (`FAILURE_THRESHOLD = 3`):** below 3 failures, a failure retries on the interval (as Next does). From the 3rd, the delay is interval × 2^(failures − 2), capped at `MAX_BACKOFF_MS = 60 000` and never below the interval (admin: 4, 8, 16, 32, 60 s). A success resets it.
- **Hidden tab:** no timer and no request; on return it polls at once.
- **One request at a time:** the next is scheduled when the previous settles.
- **First request:** waits one interval when the page already has first-paint data.

**Unit-test runner:** `node:test` + `mock.timers` (setTimeout, Date), as in 1.7/1.8a; Vitest not added. The ported Next suite runs unchanged through `tests/js/support/vitest-shim.ts` (describe/it/expect: toBe, toEqual, toContain, toHaveLength, not.*).

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Polling on failure | keeps going at the same interval, or stops (checkout, upsell); error text | "Reconnecting…" after 3 failures, backoff to 60 s, never stops (screens may `stopWhen`) | UX §12, FR58 | ADR-023, DV-UX |
| Hidden tab | keeps polling | pauses; polls on return | ADR-023 | ADR-023 |
| Overlap | `setInterval` can overlap slow requests | one at a time | correctness | proposed below |
| Image reload per poll (F-15) | every poll re-signs and reloads | stable `imageKey` rule | DV-12 | ADR-021 |
| Final ZIP limit shown | 100 MiB | 95,000,000 bytes | Cloudflare cap | DV-13 |

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 `@unit` node:test | `tests/js/polling.test.ts` (17): schedule with and without first-paint data, no overlap, checkout 2 s → 10 s at 45 s, Next intervals, stopWhen, stop aborts, refresh; the delay table; 2 failures quiet → 3rd reconnecting + 4 s/8 s backoff; success resets and keeps data; hidden pause and resume, starts hidden, response while hidden, unsubscribe; announcements (first load and unchanged data silent, counted by id) | C-02, D-02, D-16 (FR58) |
| L1 `@unit` | `tests/js/media.test.ts` (14): image and ZIP rules incl. the 10 MiB and 95,000,000 boundaries, size before type, summaries, plain-language messages (no codes), bytes and dates, stable image (same key, new key, ≤ 5 min, URL expiry), sort, nextSort, row keys | X-12, DV-13, DV-12 |
| L1 `@unit` | `tests/js/chat-messages.test.ts` (14, ported from Next) | none (UI module) |
| L1 `@unit` | `tests/js/contrast.test.ts` "story 1.8c component pairs" (20) | NFR-A1 |
| L2 Pest | `tests/Feature/DevUiRouteTest.php`: `/dev/ui/media` renders `Dev/UiMedia` in testing; a production `route:list` lacks `dev/ui/media`, a local one has it | none |
| L7 `@visual` | `tests/browser/ui-media.spec.ts`: 10 sections + 5 states (zoom, drag-over, rejected, property editing, reconnecting) × light/dark × desktop/phone = **60 baselines** | NFR-A4 |
| L7a `@visual` | same file: axe (wcag2a/aa/21aa/22aa, serious + critical) on the page and each state, both themes | NFR-A1 |
| Behaviour `@visual` | same file. **Dropzone:** limits shown, Enter/Space open the picker, too large says "Files can be up to 10 MB", wrong type, accepted file, drag-over + drop, progress bar, server code, disabled reason. **Viewer:** arrows + alt text, zoom trap/Esc/focus return/actual size, stable `src` after re-sign, no image. **Tabs:** arrows, disabled skipped, End, Tab to the panel, "Concepts, new" with the dot `aria-hidden` (top and bottom). **Table:** sort, row keys, Enter. **Thread:** day headings, Enter/Shift+Enter. **Properties:** inline edit. **usePolling:** append + polite "1 new event" with focus and position kept; Reconnecting after exactly 3 failures, then backoff and clearing; hidden pause | NFR-A1, NFR-A2, FR58 |

Test-port ledger rows resolved: none.

## Test evidence
Stack `lf-1-8c` (HTTP 18092, Vite 15182).
- `bin/ui-test`: design lint **clean**; node:test **163 passed / 0 failed** (98 before, plus 17 polling, 14 media, 14 chat-messages and 20 contrast); `tsc --noEmit` ✓.
- `bin/test`: check-agents-guide ✓, Pint ✓, Larastan level 9 ✓, Pest **316 passed (904 assertions)**.
- `PORTAL_HTTP_PORT=18092 bin/browser-test`: **160 passed / 0 failed** (96 from 1.7/1.8a with their baselines unchanged, plus 64 new). `ui-media.spec.ts --repeat-each=3`: **192 / 192**.
- `npm audit --omit=dev`: 0 vulnerabilities.

**Not run, and why:**
- Parity suite: no behavioural or endpoint change (Laravel-only gate).
- Browser tests against a production build: done in 1.8a, not repeated.
- CI: the `ui` job arrives in 1.9.
- Manual screen-reader passes: before launch.
- Not rebased on main: 1.8b merged after branching, and the parent merges.

## Gotchas
- **A paused Playwright clock (`clock.pauseAt`) stops Radix focus restore and axe**, because both use timers. Only the polling tests pause; the rest install the clock and let it flow. → propose for AGENTS.md.
- **`clock.install()` alone doesn't freeze time:** it flows until `pauseAt`. 1.8a's comment "freezes the success toast's 5 s timer" is inaccurate. Its screenshots still pass because they're taken well within 5 s.
- **A new npm dependency makes the running Vite dev server re-optimise and reload.** The first page load after `npm install` logs "Invalid hook call" once (two React copies). Warm the page (or restart `vite`) before browser tests.
- **Two `playwright-core` versions:** the top-level one is 1.65.1 (pulled by `@axe-core/playwright`'s peer range), while `@playwright/test` 1.64.1 uses its nested 1.64.1. Ad-hoc scripts must import the nested one to match the pinned image. This was already the case; not changed.
- `getByText('Reconnecting…')` also matched the catalogue's description, so the tests target `[data-polling="reconnecting"]`.
- Tailwind 4 `divide-y` borders every item except the last, so the first item grows 1 px when one is appended. "Doesn't move" is asserted on `y`, not on the whole box.
- `role=alert` with `empty:hidden` is `display:none` while empty: assert it with a CSS locator, not `getByRole`.
- Radix tab names: a visually hidden suffix inside the trigger didn't give the expected name. `aria-label` (visible label first) is deterministic.
- Typographic apostrophes (’) in user copy, as in 1.8a; tests match them exactly.

## Proposed AGENTS.md promotions (for the parent)
1. Screens poll only through `usePolling` + `<PollingStatus>` (no `setInterval`). New list items are appended, never inserted above (UX §12).
2. Private images only through `<PrivateImage>` (the stable `imageKey` rule, ADR-021).
3. Browser tests pause the Playwright clock only where timing is under test: paused time breaks Radix focus restore and axe.
4. Ported Next UI modules keep their Vitest suites through `tests/js/support/vitest-shim.ts` on node:test.
5. Catalogue pages: one per component family (`/dev/ui`, `/dev/ui/status`, `/dev/ui/media`), each with its own spec and baselines.

## Proposed decisions / risks / assumptions (for the parent)
- **DECISION:** usePolling backoff. Normal interval below 3 failures, then interval × 2^(n−2), capped at 60 s. One request at a time. A hidden tab pauses and polls on return. Announcements count new ids.
- **DECISION:** `@radix-ui/react-tabs 1.2.1` pinned (released 2026-10-12).
- **DECISION:** unit tests stay on node:test (+ mock.timers), and a Vitest-API shim runs ported Next suites. No Vitest dependency (the epics text says Vitest).
- **DECISION:** the dropzone pre-checks size, extension and MIME in the browser, with Next's rules and order. Structure and pixel checks stay server-side.
- **DECISION:** limit labels: concept image "10 MB" (Next's wording for 10 MiB) and final ZIP "95 MB" (DV-13). File sizes are shown in decimal units.
- **ASSUMPTION:** signed URLs carry `X-Amz-Date`/`X-Amz-Expires` (R2 presign v4), or the payload gives `expiresAt`. Otherwise only the key rule applies.
- **RISK (low):** data table rows are focusable `<tr>` (roving tabindex), not an ARIA grid. axe is clean, but screen-reader row navigation relies on the in-row link. Revisit in the admin queue story.

## Proposed inventory status (for the parent)
- **C-19:**
  - Tests: add `apps/portal/tests/browser/ui-media.spec.ts`, `tests/js/polling.test.ts` and `tests/js/media.test.ts`.
  - Laravel: add "media/data components, Tabs, usePolling + /dev/ui/media (1.8c)".
  - Status unchanged.
- **C-02 / D-02 / D-16 / K-02 (polling):**
  - Laravel: "usePolling (1.8c)".
  - Tests: `tests/js/polling.test.ts`.
  - Status unchanged until the screens use it.

## Proposed UX spec changes (for the parent / owner)
- **§11 Tabs:** `Tabs placement="bottom"` draws the bottom bar; the 1.9 shells position it. If the shells' tabs are route links (one URL per section), a nav with `aria-current` may fit better than ARIA tabs. Decide in 1.9.
- **§8.1 addendum:** the 20 pairs in `contrast.test.ts` "story 1.8c component pairs" (all pass in both themes).

## Docs updated
This story record; `apps/portal/README.md:15` (catalogue link). Shared tracking files are left to the parent.

## Open items
- **Merge with 1.8b (parent):**
  - `routes/web.php` and `DevUiRouteTest.php`: both stories add lines to the same dev block and assertion; keep both.
  - 1.8b owns `Skeleton`/`EmptyState`. Replace this story's `LoadingBlock` placeholders and default empty text with them (Card, ConceptCard, FileCard, Thread, DataTable, PropertiesPanel).
- **Epic 7 upload screens:** request-key persistence (`concept-upload-key.ts`) and real progress (XHR) around `UploadDropzone`.
- **Epics 6–8:** wire `usePolling` to the snapshot endpoints (customer 10 s, admin 2 s, audit 2.5 s; checkout via `checkoutInterval`).
- **1.9:** the shells use `Tabs` (top at `md` and up, fixed bottom bar below). Decide tabs vs nav links (see the UX proposal above).
- **When `ui-catalogue.spec.ts` is next touched:** fix 1.8a's comment that says the clock "freezes" the toast timer.
