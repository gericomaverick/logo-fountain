# Story 4.9b: Auth screens

**Status:** ready-for-dev (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only, UI (design review) · **Epic:** 4 · **Covers:** A-05, A-07, A-08, UX §14 (auth screens) · **Gate:** `@auth&@ui`, `@visual` · **After:** 4.3–4.8, 4.9a, 1.9 (done) · **Stacks on:** `main` (dependencies done); in the SERIAL chain, the previous Epic 4 story's branch. Shared files: `resources/js/Pages/Auth/`, `routes/web.php`, `resources/js/Layouts/`, Playwright baselines

> Created with the repo's create-story form. All `apps/web` `file:line` checked 2026-11-22.

## Story
As a visitor, I can sign in, ask for a link, and set or reset my password on screens that match the design, and a link's token never stays in my browser history.

## Acceptance criteria
1. **Screens** (Inertia pages): `/login` (email, password, "Email me a sign-in link", forgot-password link, brand panel on desktop only), `/forgot-password`, `/set-password`, `/reset-password`, `/auth/callback` ("Complete sign-in", one sentence, **Confirm sign-in** button, "Request a fresh magic link"). Copy from `login/page.tsx`, `set-password/page.tsx:29-48`, `callback/page.tsx:11-28`; layout per UX §14 and the 1.8a primitives.
2. **Fragment proof.** `takeMailboxProof()` reads `token` and `next` from `location.hash` and replaces the URL with the path+search before render (`lib/auth/client.ts:7-13`); a test asserts `history.state`/URL has no token after mount and the token isn't in any link.
3. **Callback never auto-confirms.** Only the button posts `magic-link/verify`; success → `router.replace(SafeNext(next))`; missing token → "This sign-in link is missing or expired. Request a fresh magic link to continue." (`callback/page.tsx:17`).
4. **Login.** Client validation `validateLogin` messages (`validation.ts:20-28`); on success navigates to `SafeNext(?next)`; failure shows only the fixed text "Authentication could not be completed. Check your details or request a new link." (`client.ts:4`). `?password=updated` shows a success note after reset.
5. **Set/reset.** Rules shown up front, password + confirm, show/hide; mismatch and rule errors client-side (`validation.ts:45`); success → `/login?password=updated`.
6. **Forgot.** Always shows the generic confirmation after submit (mirrors the server).
7. **`/` redirects to `/login`** (4.8) and signed-in visitors to `/login` go to `/dashboard`.
8. **Accessibility.** Labelled fields, `role="status"` live regions, focus to the first error, keyboard-only flow; axe clean.
9. **Visual.** `@visual` baselines for each screen at mobile and desktop widths; approved by the owner, not auto-accepted. Design-lint (L7b) green: tokens only.
10. **Logout helper** ported from `lib/auth/logout.ts:2-12` for the shell's sign-out (reports success only after the session check shows anonymous).

## Inventory scope
A-05, A-07, A-08 (UI halves). Ledger #56 (`auth-shell.test.ts`, Keep TS) is relevant to the shell only.

## Next.js source read
`app/login/page.tsx:1-185`; `app/set-password/page.tsx:1-133`; `app/reset-password/page.tsx:1-133`; `app/forgot-password/page.tsx:1-97`; `app/auth/callback/page.tsx:8-30`; `lib/auth/client.ts:1-13`; `lib/auth/logout.ts`; `components/auth-shell.tsx`; `ux-design.md` §14.

## Behaviour notes
- set-password and reset-password are the same form against the same endpoint with different titles/copy.
- Page-level `next` is untrusted: always through `SafeNext`.

## Laravel guidance
Inertia pages under `resources/js/Pages/Auth/`, shared `AuthShell` layout; `@inertiajs/react` forms are NOT used for the JSON endpoints: use `fetch` with `Content-Type: application/json` and the same-origin cookie (the endpoints are the 4.3–4.7 JSON routes). Strip hash before first paint (in an effect-free initializer where possible).

## Planned deviations from Next.js
None planned. Screens are a restyle to design A, as UX §14 specifies.

## Tasks
1. `AuthShell` layout and the five pages. 2. Client helpers. 3. Vitest/Pest-browser and Playwright tests. 4. Baselines for owner approval. 5. Record, inventory, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L5 `@auth&@ui` | `tests/browser/auth-*.spec.ts`: login, magic-link confirm (token stripped), set/reset, forgot | A-05, A-07, A-08 |
| `@visual` | baselines per screen/width | UX §14 |
| JS unit | `resources/js/lib/auth.test.ts`: `takeMailboxProof`, validation messages | A-05 |
| a11y | axe on each screen | UX §14 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Open questions (with recommendations)
1. **Brand panel imagery.** *Recommendation:* use the existing logo and a flat panel from the tokens; no new assets.
2. **Owner items:** baseline approval only.

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

## epic-4-build-order
SERIAL, one builder, each story forked from the previous branch: **4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8 → 4.9a → 4.9b.**
Dependencies: 4.2 needs 4.1 only for the chain (real deps 2.4); 4.3 ← 4.1, 4.2; 4.4 ← 4.2; 4.5, 4.6 ← 4.4; 4.7 ← 4.3; 4.8 ← 4.1 (SafeNext can move earlier: 4.4 stubs it); 4.9a ← 4.6; 4.9b ← 4.3–4.8.
Shared files: `routes/auth.php` (4.1 creates; 4.3–4.7 append), `bootstrap/app.php` (4.1, 4.8), `app/Support/Auth/` (SessionCap 4.1; CredentialFence, AuthProofs 4.2; PasswordRules 4.6; SafeNext 4.8), `app/Actions/Auth/` (4.3–4.7), `tests/Concurrency/` (4.2, 4.5, 4.6, 4.9a), `tests/Arch/AuthTest.php` (4.2, 4.8, 4.9a), `resources/views/mail/layouts` (4.4).
Possible parallel: 4.9a with 4.7/4.8 (disjoint files) once 4.6 lands.
