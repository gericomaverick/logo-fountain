# Brownfield: pages, UI behaviour and client-side state (as built)

Phase 0 capture, 2026-11-18. Covers **A-15, A-16, C-01…C-20, D-01…D-20, K-02, K-03, K-10**. Paths are relative to `apps/web/src/app/`.

> **Redesign (DV-UX, 2026-11-18):** the Laravel screens are designed fresh (BMAD UX step 2.2). Treat this document as the **behaviour spec** for each screen: what it shows, what it lets people do, its guards, polling, storage and copy that states rules. It is **not** a layout to copy. The markup and classes from `apps/web` aren't ported.

## 1. How pages move to Laravel and Inertia

There are two kinds of page today:
- **Server pages** (React Server Components that query Prisma directly): `dashboard`, `admin` (dashboard), `admin/layout`, `admin/projects/[id]/brief`, `project/[id]` (initial snapshot), `project/[id]/brief`. In Laravel, each becomes a **controller that builds Inertia props** using the same query logic, documented below. The React markup moves into `resources/js/Pages/...`.
- **Client pages** (`"use client"`, fetching `/api/*`): everything else. These move almost unchanged into Inertia pages. They keep calling the same `/api/*` JSON endpoints, which are why we keep those contracts identical.
- Mechanical swaps in every page: `next/link` → Inertia `<Link>`, `useRouter().push/replace/refresh` → `router.visit/replace/reload`, `useParams`/`useSearchParams` → page props or `URLSearchParams`, `redirect()` → controller redirects, `next/font` Inter → self-hosted Inter via Vite, `metadata` → Inertia `<Head>`.
- Root layout: title template "%s | Logo Fountain Portal", default "Logo Fountain Portal", description "Client and admin portal for Logo Fountain projects.", **`robots: noindex, nofollow`**, `metadataBase` `https://app.logofountain.co.uk`. `/theme-init.js` runs as a blocking script before paint (theme from localStorage). `SafePerformanceMeasure` is mounted globally.

## 2. Page inventory

| Route | Kind | Guard | Data and behaviour to keep |
|---|---|---|---|
| `/` | server | none | Redirect → `/login` |
| `/login` | client | none | Email and password plus a magic-link request. `next` param (safe-next). On success `router.push(next)`. Shows a "password updated" notice when `?password=updated` |
| `/forgot-password` | client | none | POST forgot-password, uniform message |
| `/reset-password`, `/set-password` | client | none | Read the token from the **fragment** (`takeMailboxProof`), validate the password and confirmation client-side (`auth/validation.ts`), POST reset-password, then `router.replace("/login?password=updated")`. Headers: `Referrer-Policy: no-referrer`, `Cache-Control: no-store` |
| `/auth/callback` | client | none | "Confirm sign-in" button, then POST magic-link/verify, then `router.replace(safeNext)`. Same no-referrer and no-store headers |
| `/checkout/start` | route | none | See checkout doc |
| `/checkout/success?session_id` | client | none | Poll `GET /api/checkout/status` every **2 s**. After **45 s**, slow down to **10 s** and show troubleshooting (with a "resend sign-in email" button → `POST /api/checkout/resend-magic-link`) |
| `/checkout/continue?session_id` | client | none | Button → `POST /api/checkout/magic-link`, then shows a check-your-email state |
| `/dashboard` | **server** | user, otherwise `/login`. **Admins are redirected to `/admin`** | Greeting "Hey, {Firstname}" (first letter capitalised) or "Hey there". Projects across all memberships, newest first. Sections: **needs-action = AWAITING_BRIEF, CONCEPTS_READY, ON_HOLD**; delivered = DELIVERED, CANCELLED, REFUNDED; in-progress = the rest (this differs from the admin grouping). Only sections with projects are shown, except needs-action, which shows a "good news" empty line. Rows: title (brand name or "Your logo project"), badges "New concepts" (max published/approved concept createdAt/updatedAt > lastSeenConceptsAt; **comments not counted here**, unlike the snapshot) and "New message" (non-system), status note copy per state, package label, "Updated {d MMM yyyy}"/"Created …" (en-GB), status badge = overview status. Every link goes to `/project/{id}` |
| `/project/{id}` | **server** + client `project-hub.tsx` | user, otherwise `/login`. Membership (admins aren't members, so they get a null snapshot) | The initial snapshot is built server-side (same JSON shape as the API) plus the profile firstName. The hub **polls `GET /api/projects/{id}` every 10 s**. Upsell return (`?upsell=1&kind&session_id`): polls checkout status at 2.5 s, then slows to 7 s, with banners "Confirming your purchase" / "Purchase confirmed" / "Purchase confirmation delayed". Final download → `POST /api/projects/{id}/finals`, then navigate to the URL. Welcome card (`shouldShowProjectWelcome`), journey (`project-journey.ts`), next action (`project-hub.ts`), activity groups, allowances, area cards (Concepts / Messages / Brief subtitles), upsell panel (`revision-purchase.tsx`) |
| `/project/{id}/brief` | **server** + client `brief-form.tsx` | user, membership (otherwise an in-page "not found" state, not a 404) | Up to 8 brief versions (parsed) for the read-only view. Wizard: 4 steps plus review, step gating, choice inputs, progress. **Draft autosave** 800 ms after a change: write `sessionStorage` (`logo-fountain:brief-draft:{projectId}:v{n}`) **and** serialised PUTs to `/brief/draft` (each waits for the previous one). The status shows saving, saved or failed (with "local copy kept"). A `beforeunload` warning when there are unsaved changes. Submit → confirmation dialog (checkbox) → POST brief → clear the session draft |
| `/project/{id}/concepts` | client | API | GET concepts, then POST read-state `concepts`. Gallery cards |
| `/project/{id}/concept/{cid}` | client | API | GET project snapshot, assets (version history), comments. A unified thread (`concept-thread.ts`: revision requests plus comments, sorted). POST comment, POST revision request (with remaining-revisions messaging, and the upsell when exhausted), POST approve (confirmation copy in `final-approval.ts`, acknowledgement checkbox) |
| `/project/{id}/messages` | client | API | GET session (viewer id), GET messages, POST read-state `messages`. Chat grouped by day, newest last, Enter-to-send rules (`chat-messages.ts#shouldSendOnKey`), system messages styled differently |
| `/settings` | client | API | GET session and profile. PUT profile (first and last name). Change password (POST auth/password, then signed out → login). Text "Billing email and VAT number will be added here in a later update." |
| `/settings/invoices` | client | API | GET `/api/invoices`: a table with document links |
| `/admin` (layout) | server | no user → `/login?next=/admin`. Not admin → (see layout) | |
| `/admin` | **server** | `requireAdmin` | Every project, with pending feedback (non-delivered revision requests), approved/final flags, latest non-system message, concept activity (concept createdAt **and** comments), read state **for the admin user**. Grouping: `admin-dashboard.ts`. **Urgency score** = 100 × pendingFeedback + 60 if new messages + 20 if new concepts + 50 if stuck. Ties broken by latest activity (max of updatedAt, latestMessageAt, latestConceptAt), descending. Rows show the client name and owner, package, display status, badges, and "Resolve pending feedback" → concepts inbox |
| `/admin/projects/{id}` | client (642 lines) | API | **Polls `GET /api/admin/projects/{id}` every 2 s**. Summary cards, status actions (hold, cancel, resume with reason), entitlement override form (`admin-override-inputs.ts` keeps dirty fields while polling), final upload, notify retry (`admin-final-publication.ts` shapes the UI results), admin download, reset (confirm clean-slate), revision delivered, reprocess checkout, invoices list, copy-to-clipboard (1.5 s "copied") |
| `/admin/projects/{id}/brief` | **server** | admin | Latest brief parsed and rendered through `brief-document.tsx` |
| `/admin/projects/{id}/concepts` | client | API | GET admin concepts. Pending-feedback inbox. Upload or replace, delete, mark delivered. POST read-state `concepts` |
| `/admin/projects/{id}/concepts/{cid}/revision` | client | API | Revision upload (`uploadMode=revision`) with the request-key persistence (`concept-upload-key.ts`), then back |
| `/admin/projects/{id}/upload` | client | API | GET project, then concept upload form |
| `/admin/projects/{id}/messages` | client | API | Session, concepts (for thread choice), messages, read-state. Reply |
| `/admin/projects/{id}/audit` | client | API | **Polls the audit endpoint every 2.5 s**. Rendered with `summarizeAuditPayload` (first 3 keys) |
| `/admin/health` | client | API | GET admin/health. Check list |

## 3. Browser storage (per-viewer conveniences, keep as is)

| Key | Where | Purpose |
|---|---|---|
| `localStorage` theme key | `components/theme-switcher.tsx`, `public/theme-init.js` | Light/dark/system theme |
| `sessionStorage` `logo-fountain:brief-draft:{projectId}:v{n}` | brief-form | Local draft copy |
| `sessionStorage` upsell snooze key | `components/revision-purchase.tsx` | "Not now" snooze for **24 h** |
| `sessionStorage` `concept-upload:{identity}` | `lib/concept-upload-key.ts` | Idempotent upload request key |

## 4. Shared components (`components/`)

`app-frame`, `header-nav` (logo, nav, logout with verified-logout behaviour), `page-shell`, `ui` (Card, SubCard, PageHeader with breadcrumbs, EmptyLine, …), `icons`, `project-status-badge`, `project-welcome`, `allowances`, `revision-purchase`, `brief-document`, `brief-field-input`, `brief-progress`, `auth-shell`, `feature-notice-card`, `theme-switcher`, `safe-performance-measure`, `frame-context`. The design tokens (`globals.css`: `portal-*` classes, colour variables, light and dark) move unchanged into `resources/css/app.css` (Tailwind 4).

## 5. Screens that need L7 baselines and design approval (formerly "visual parity targets")

Screenshots at 1280 px and 390 px, light and dark: login, dashboard (each section state), project hub (awaiting brief with welcome; concepts ready with badges; revisions exhausted with upsell; final files ready), brief wizard step 1 and review, concept detail with thread, messages, settings, invoices, admin dashboard, admin project overview, admin concepts inbox, admin health, checkout success (pending and troubleshooting).

## Verified by the journey suite (story 0.8a, 2026-11-19)
1. `next dev --hostname 0.0.0.0` blocks its hot-reload socket for a page opened on 127.0.0.1 (`next/dist/server/lib/router-utils/block-cross-site-dev.js:75-105`), so client pages never hydrate (checkout success never polls). Run Next on 127.0.0.1 plus a forwarder for Docker (`tests/parity/README.md`).
2. `next dev` sometimes reloads a page right after its first compile, which loses typed input and the fragment token (`apps/web/src/lib/auth/client.ts:7-13` strips it). The page objects retry. Dev-only, so Laravel needn't copy it.
3. **The setup link's `next=/project/{id}` is ignored:** `/set-password` always goes to `/login?password=updated` (`app/set-password/page.tsx:47`). After setting a password, a customer lands on the dashboard, not their project. With the UX one-project shortcut, Laravel lands them on the project (DV-UX), so this is a `@deviation` candidate for 0.8e.
4. The project page has no explicit "whose turn" element, and the status badge has no accessible role. The Next page objects derive the turn from badge text and dashboard grouping (`app/dashboard/page.tsx:38`). The Laravel turn banner (UX §2.5) gives this directly.
