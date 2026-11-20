# Story 1.8c: Media, data components and `usePolling`

**Status:** in-progress (2026-11-20) · **DoD variant:** Laravel-only · **Epic:** 1 · **Covers:** UX §11, FR58, ADR-023 (+ ADR-021 stable image) · **Gate:** `@visual`, `@unit` · **After:** 1.8a
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
