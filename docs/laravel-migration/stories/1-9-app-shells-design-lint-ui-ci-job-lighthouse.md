# Story 1.9: App shells, design lint, UI CI job, Lighthouse

**Status:** review (2026-11-20) · **DoD variant:** Laravel-only · **Epic:** 1 (last story) · **Covers:** UX §5, §13, L7/L7a/L7b, NFR-P2 · **Gate:** `@visual`, `@unit`, Pest · **After:** 1.8b, 1.8c
**Branch:** `worktree-agent-a21c9cafffb6f97db` (not pushed) · **Stack:** `COMPOSE_PROJECT_NAME=lf-1-9`, HTTP 18093, Vite 15183

## Acceptance criteria (epics.md §1.9)
1. A raw hex colour or pixel font size in a component fails CI. ✓ `raw-colour` (1.7) + new `font-size` and `gradient` rules, in `bin/ui-test` → CI `ui` job.
2. The customer shell (top bar, tabs, phone bottom bar) and the admin shell (sidebar, workspace, properties column) render. ✓ `/dev/ui/shells`, `/dev/ui/shells/admin`.
3. The CI `ui` job runs the unit tests, tsc, ESLint plus the design lint, L7 and L7a. ✓ `portal.yml` `ui`. A `lighthouse` job (mobile, median of 3). ✓ `portal.yml` `lighthouse`, on the shells Overview sample (no seeded data yet; see Decisions).
4. Follow-ups gathered from 1.7–1.8c: `ToastProvider` in both shells ✓; tabs vs nav decided ✓; 1.8c `LoadingBlock` → 1.8b `Skeleton`/`EmptyState` ✓; Playwright image pinned by digest ✓; one-primary lint decided ✓.

## Inventory scope
C-19 (frame/nav part): the shells exist as presentational layouts; the row completes with the real screens (Epics 4–7). No other row. Proposed status below.

## Next.js source read
`apps/web/src/components/header-nav.tsx` (`AppSidebar`, `navItemsFor`, `shouldShowClientInvoicesNav`), `app-frame.tsx`, `page-shell.tsx`, `theme-switcher.tsx`. Docs: epics §1.9 + DoD, ux-design §5, §8, §11–§14, §16, prd NFR-P2/NFR-A1–A4, 02-test-strategy L0/L7/L7a/L7b + CI, ADR-022, ADR-028, research-technical §1 (pin policy), stories 1.7, 1.8a, 1.8b, 1.8c (open items), `apps/portal/AGENTS.md` §8.

## Behaviour notes (written before converting)
- **Next's frame** is one sidebar for both roles, fed by `GET /api/auth/session`: customers get Projects (`/dashboard`, also active on `/project/*`), Invoices (`/settings/invoices`, only when `authenticated && !isAdmin`) and Settings; admins get Queue (`/admin`, also `/admin/projects/*`), Health and Settings. Initials avatar from the email, the theme switcher and Log out (`logoutAndVerifySession`) sit in the sidebar; a menu button toggles it on small screens. There are no project section tabs (the hub is one page), no skip link and no toast provider.
- **Kept:** the role split of destinations (Queue/Health for admins; Invoices for customers only), theme in the frame, sign-out in the frame.
- **Changed (DV-UX, UX §5):** customers get a top bar + project section tabs (+ phone bottom bar); Settings becomes Account in the user menu; admins keep a sidebar with a properties column. Auth, session loading and logout behaviour arrive with Epic 4 (`onSignOut`, `user` are props here).

## Laravel implementation
| Piece | Where |
|---|---|
| Customer shell: skip link, banner (brand, user menu), Breadcrumb nav (back link < md), "Project sections" TabNav top (≥ md) / fixed bottom bar (< md) with More → Brief, `main#main`, `ToastProvider aboveTabBar` | `resources/js/Layouts/CustomerShell.tsx:53`, `MoreMenu` `:98` |
| Admin shell: sidebar = banner (brand, "Admin" nav Queue/Health, user menu), collapses to a Menu < lg; main with breadcrumbs + sections (… Audit); `aside` "Project properties" 360 px beside main ≥ lg, stacked below | `resources/js/Layouts/AdminShell.tsx:59` |
| Shared: `SkipLink`, `Brand`, `UserMenu` (Signed in as, Account, Invoices (customers), theme radio items, Sign out) | `resources/js/Layouts/ShellParts.tsx` |
| `TabNav`: URL-routed tabs as `nav` + links + `aria-current="page"`, styled by Tabs' exported `tabListClass`/`tabClass`/`TabLabel` | `Components/ui/TabNav.tsx:40`, `Components/ui/Tabs.tsx` |
| `Breadcrumbs` (UX §5.3 rule 3) | `Components/ui/Breadcrumbs.tsx` |
| `MenuRadioGroup`/`MenuRadioItem`; `ThemeMenuItems` (UX §8.1 "theme in the user menu") | `Components/ui/Menu.tsx`, `Components/ui/ThemeSwitcher.tsx` |
| Catalogue page (sample props, `?section=` routes the tabs) | `Pages/Dev/UiShells.tsx`, `routes/web.php:35-42` |
| 1.8c follow-up: `LoadingBlock` removed; ConceptGallery/Thread/FileCardPlaceholder/PropertiesPanel/DataTable use `Skeleton` (new `onSunken`) and default to `EmptyState` | `Components/ui/{ConceptCard,Thread,FileCard,PropertiesPanel,DataTable,Skeleton,Card}.tsx` (`d1010c3`) |
| Design lint `font-size` + `gradient` rules | `scripts/design-lint.mjs:51-60`, header `:12-24` |
| ESLint flat config (recommended: ESLint, typescript-eslint, react-hooks incl. compiler rules, jsx-a11y), `npm run lint`, in `bin/ui-test` | `eslint.config.js`, `package.json`, `bin/ui-test` |
| One-primary browser check | `tests/browser/support/views.ts` `expectOnePrimaryPerView` |
| Lighthouse CI | `bin/lighthouse`, `tests/lighthouse/{package.json,package-lock.json,.npmrc,lighthouserc.json,summary.mjs}` |
| Page chunk modulepreload (Laravel's Inertia `@vite` pattern) | `resources/views/app.blade.php:16-19` |
| Dev nginx gzips `/build/` (static only) | `docker/nginx/default.conf:16-26` |
| Vite pre-bundles all pages' deps at start | `vite.config.ts:20` |
| CI `ui` and `lighthouse` jobs; upload-artifact pinned by SHA | `.github/workflows/portal.yml:75`, `:133` |
| Image pins: Playwright `v1.64.1-noble@sha256:2f05f8a7…` (`bin/browser-test`, `bin/lighthouse`); `bin/ui-test` uses the compose vite image `node:24.22.3-bookworm-slim@sha256:dc26ae92…` | `bin/*` |

**Pins (released ≤ 2026-10-30 unless a security exception):** `eslint` 9.39.5 (2026-07-10) and `@eslint/js` 9.39.5: ESLint 10.14.0 qualifies by date, but `eslint-plugin-jsx-a11y` 6.10.2 (latest) peers `eslint ^3…^9`. `eslint-plugin-react-hooks` 7.1.1 (2026-04-17). `eslint-plugin-jsx-a11y` 6.10.2 (2024-10-26). **`typescript-eslint` 8.73.0 (2026-11-16, security exception):** ≤ 8.72.2 pulls `minimatch` < 11.0.1 (GHSA-g3hv-75wg-m249, moderate). **`@lhci/cli` 0.16.1 (2026-11-11, security exception):** 0.15.1 had 16 advisories (13 high: `tmp`, `extract-zip`, `basic-ftp`, `zod`, …), all fixed in 0.16.1 (Lighthouse 13.6.0, 2026-10-27). `actions/upload-artifact` v7.0.2 (2026-10-07, SHA `cf430e03…`). All `--save-exact`; `.npmrc` `ignore-scripts=true` in both packages.
**Audits:** portal `npm audit` (all deps) **0**, `--omit=dev` **0**; `tests/lighthouse` `npm audit` **0**.

## Decisions (with the reasons)
- **Project tabs = `nav` + links with `aria-current="page"`, not ARIA `tablist`.** Each section is its own URL (an Inertia page). A `tab` role promises in-page panels and arrow-key switching without navigation, and hides link semantics (open in a new tab, history). Visuals are the 1.8c Tabs' (shared class builders), so both look identical; `Tabs` stays for in-page panels. The "new" dot is `aria-hidden`; the link's name is `aria-label` "Concepts, new" (as Tabs; a hidden suffix gave "Concepts , new").
- **Phone overflow:** the bottom bar is Overview · Concepts · Messages · Files + **More** (a menu with Brief); Brief is also on Overview's Shortcuts. On the Brief page, More is marked active and named "More, Brief is open".
- **Theme placement:** the user menu (radio items, the menu stays open on choice) in both shells, per UX §8.1 "Account and the user menu". The Account page's chips come with that screen.
- **One primary per view: not linted statically.** A view is a runtime composition (page + shell + open dialog + conditional branches); a per-file count is both noisy (catalogues, branches) and blind (a primary inside TurnBanner or a component). Enforced in the browser by `expectOnePrimaryPerView(page)` (≤ 1 visible `data-variant="primary"` outside dialogs, ≤ 1 per open dialog); the shells spec uses it, and each screen spec should call it per state.
- **Design lint scope:** `font-size` rejects arbitrary px/pt/rem/em sizes (not only px), `fontSize` style values and CSS literal `font-size` outside `app.css` (UX §16 "no raw … sizes outside the token files"). `gradient` added because 02-test-strategy L7b lists ad-hoc gradients.
- **ESLint exceptions (inline, justified):** `jsx-a11y/no-noninteractive-tabindex` on focusable scroll regions (`ConceptViewer` zoom, `UiStatus` tracker: axe `scrollable-region-focusable` needs them) and the catalogue's focusable activity items; `jsx-a11y/no-noninteractive-element-interactions` on the PropertiesPanel edit form (Escape bubbling from its controls); `react-hooks/purity` on `PrivateImage`'s `Date.now()` (runs only on a prop change). Fixed rather than excepted: `usePolling`'s latest-options ref (layout effect), `ConfirmDialog` reset (during render, no effect), radios' unsupported `aria-invalid`, the catalogue fake server (no refs in render).
- **Lighthouse page:** `/dev/ui/shells?section=overview` (customer shell + a representative Overview: turn banner with its primary, stage tracker, two allowance meters, shortcuts). **Moves to a seeded real Overview in Epic 6.** Production build, stack without Vite.
- **Lighthouse numbers (median of 3, Lighthouse 13.6.0, mobile, Moto G Power, slow 4G):**

  | Setup | LCP | CLS | Perf |
  |---|---|---|---|
  | Simulated (NFR-P2's method, CI) before fixes | 750 ms | 0 | 99 |
  | **Simulated, final (CI assertion)** | **754 ms** (CI replay 795 ms) | **0** | 99 |
  | Applied (`throttlingMethod=devtools`), no gzip, no preload | 5307 ms | 0 | 68 |
  | Applied, + gzip on `/build/` | 3784 ms | 0 | 81 |
  | **Applied, + page-chunk modulepreload (final)** | **2876 ms** (fails 2500) | 0 | 90 |

  The assertion is NFR-P2 as written: LCP ≤ 2500 ms and CLS ≤ 0.1, median, simulated throttling (Lighthouse's default). It passes. **Not loosened, but flagged:** Lantern's simulated LCP flatters a client-rendered page (no SSR, ADR/arch §4.4). With applied throttling, the same page is 376 ms over. The remaining cost is `app.js` (352 KB, 110 KB gzipped) on a 4× CPU. Run the cross-check with `LHCI_COLLECT_ARGS="--settings.throttlingMethod=devtools" bin/lighthouse`. See Proposed risks.
- **gzip on `/build/` in dev nginx:** production compresses at Cloudflare. Without it, Lighthouse measures uncompressed transfers. It applies to static built files only, so app and API responses keep their exact headers (parity).
- **`@lhci/cli` in its own package** (`tests/lighthouse`): 323 packages that the dev stack and `bin/ui-test` never need.
- **CI ui job uses the Vite dev server** (as `bin/browser-test` does locally), so the baselines are the same ones the developers generate. `optimizeDeps.entries` covers every page, so a cold server doesn't re-optimise and reload mid-test.

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Customer frame | sidebar: Projects, Invoices, Settings | top bar + user menu (Account, Invoices, theme, Sign out); project section tabs; phone bottom bar | UX §5.1 | DV-UX |
| Admin frame | sidebar: Queue, Health, Settings | sidebar: Queue, Health; Account/theme/Sign out in the user menu; properties column | UX §5.2 | DV-UX |
| Skip link, landmarks, breadcrumbs | none / partial | skip link → `main`, banner/nav/main/aside, breadcrumbs (back link on phones) | UX §5.3, §13 | DV-UX |
| Toasts | none | `ToastProvider` in both shells | UX §11 | DV-UX |

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L7b `@unit` | `tests/js/design-lint.test.ts`: + "rejects raw font sizes outside the token file" (8 findings across tsx/css/blade, token-based sizes pass) and "rejects ad-hoc gradients outside the token file" (5 findings; the token `@utility` passes) | C-19 (NFR-A2) |
| L0 | ESLint `npm run lint` (`--max-warnings=0`) in `bin/ui-test` | none |
| L2 Pest | `tests/Feature/DevUiRouteTest.php`: shells customer/admin render `Dev/UiShells` with `shell`/`section`, default `overview`, section capped at 20 chars; production `route:list` lacks `dev/ui/shells` and `dev/ui/shells/admin`, local has both | none |
| L7 `@visual` | `tests/browser/ui-shells.spec.ts`: 5 views (customer overview/concepts/projects, admin overview/queue) × light/dark; desktop full page, phone first screen + scrolled end; user menu (both), More menu and admin Menu (phone) = **38 baselines** | C-19, NFR-A4 |
| L7a `@visual` | same file: axe (wcag2a/aa/21aa/22aa, serious + critical) on every view and menu state, both themes | NFR-A1 |
| Behaviour `@visual` | same file: skip link first tab stop, visible on focus, Enter focuses `main`; one banner/main/h1 and the sections nav per view; one primary per view; tabs are links (0 `tab`/`tablist`), `aria-current` moves on navigation, "Concepts, new" with `aria-hidden` dot; desktop top bar has 5 and no bottom bar; phone bottom bar fixed to the viewport bottom, 4 links + More, ≥ 44 px, last content clears it, Brief via More and Overview, back link "Back to Northvale Coffee"; Tab order through the links, Enter follows; theme via the user menu (radio, stays open, ticked, stored, Esc returns focus); toasts from the shell, above the bottom bar on phones; admin sidebar `aria-current`, properties aside 360 px beside main (desktop) / below main (phone), Menu collapse, no sideways scroll at 390 px; admin user menu has no Invoices | C-19, NFR-A1, NFR-A2 |
| NFR-P2 | `bin/lighthouse` (`tests/lighthouse/lighthouserc.json`) | NFR-P2 |

Test-port ledger rows resolved: none.

## Test evidence
Stack `lf-1-9` (HTTP 18093, Vite 15183).
- `bin/test`: check-agents-guide ✓, Pint ✓, Larastan level 9 ✓ (No errors), Pest **318 passed (959 assertions)** (317 on main + 1).
- `bin/ui-test`: design lint **clean**, ESLint **clean** (0 warnings), node:test **217 / 0 failed** (215 + 2), tsc ✓.
- `PORTAL_HTTP_PORT=18093 bin/browser-test`: **260 passed, 8 skipped, 0 failed** (208 before + 52 shells; the 8 skips are the phone-only menu states and layout tests on the other project). `ui-shells.spec.ts --repeat-each=3`: **156 passed, 24 skipped**; `--repeat-each=4` earlier: 208/208. One early repeat run (during a parallel heavy `npm install`) timed out once waiting for an h1; not reproduced in 7 repeats since; the spec's page-load wait is now 15 s.
- **CI replays (local, cold: fresh volumes, no `node_modules`, no build, `CI=true`):** `ui` job steps → ui-test 217/217, browser **260 passed / 8 skipped**, `bin/log-grep` clean on logs, `playwright-report`, `test-results`. `lighthouse` job steps → build ✓, median LCP **795 ms**, CLS **0**, assertions pass, log-grep clean on logs and both report dirs. Cold `npm ci` of `tests/lighthouse` inside the Playwright image ✓ (323 packages).
- `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.7` (repo root): **clean**.
- `npm audit` (portal, all and `--omit=dev`): 0; `tests/lighthouse`: 0.

**Not run, and why:** GitHub Actions itself (the parent pushes and watches). Parity suite (no endpoint or behaviour change; Laravel-only gate). Browser tests against a production build (CI and local use the dev server, as since 1.8a). Manual screen-reader passes (before launch, UX §13).

**Baselines changed:** `ui-media.spec.ts` **49 of 60**, re-generated in the pinned image: content changes in `concepts`, `files`, `thread`, `table`, `properties` (× light/dark × desktop/phone = 20); a 1 px sub-pixel move (taller content above) in `viewer`, `uploads`, `polling` (12) and the states `dropzone-drag-over`, `dropzone-rejected`, `property-editing`, `reconnecting` (16) and `zoom-light-desktop` (1). Unchanged: `cards`, `tabs`, 3 `zoom`. **No `/dev/ui` or `/dev/ui/status` baseline changed.** New: 38 `ui-shells.spec.ts`.

## Gotchas
- **Hidden-text suffixes in names add a space:** a `sr-only` ", account menu" after the visible name gave "Alex Morgan , account menu". Use `aria-label` starting with the visible text (as 1.8c Tabs). → propose for AGENTS.md.
- **Full-page screenshots paint `position: fixed` bars mid-page** (at the original viewport bottom). The phone shells take the first screen and the scrolled end instead.
- **Lighthouse needs a production build:** with `public/hot` present, Laravel serves the Vite dev server and the numbers are meaningless. `bin/lighthouse` refuses then. Locally: `docker compose stop vite`, `rm public/hot`, `docker compose run --rm --no-deps vite npm run build`, then `bin/lighthouse`; `docker compose start vite` afterwards.
- **Lantern (simulated) LCP vs applied throttling** differ by ~4× on this client-rendered page (754 vs 2876 ms). Check both when a page's JS grows.
- **The design lint also reads comments:** a comment naming the display font failed `display-font`. Word comments around it.
- **ESLint 10 vs jsx-a11y:** jsx-a11y 6.10.2 peers ESLint ≤ 9, so ESLint stays on 9.39.x until jsx-a11y supports 10.
- **react-hooks 7 (React Compiler rules)** flags ref reads/writes during render and setState in effects: keep "latest value" refs in a layout effect, and reset state on prop change during render.
- `docker compose run --rm vite …` overrides the service command; it is how the CI lighthouse job builds without starting the dev server.
- `--update-snapshots` (Playwright 1.64) rewrites only mismatching baselines, so the diff shows exactly what changed.

## Proposed AGENTS.md promotions (for the parent)
1. Screens render inside `Layouts/CustomerShell` or `Layouts/AdminShell` (skip link, landmarks, ToastProvider, theme in the user menu). Section tabs that are URLs use `TabNav` (links + `aria-current`); `Tabs` is only for in-page panels.
2. Every screen spec calls `expectOnePrimaryPerView(page)` (`tests/browser/support/views.ts`) in each state it reaches; the design lint can't see views.
3. Accessible names that extend the visible label: `aria-label` starting with the visible text, never a hidden suffix span (adds a space).
4. Design lint now also rejects raw font sizes and ad-hoc gradients; ESLint runs in `bin/ui-test` with `--max-warnings=0`; an exception is an inline `eslint-disable-next-line <rule> -- <reason>`.
5. `bin/lighthouse` measures a production build only (stop vite, remove `public/hot`, build). Cross-check applied throttling with `LHCI_COLLECT_ARGS="--settings.throttlingMethod=devtools"`.
6. CI: `portal.yml` has `ui` (ui-test + browser-test, report uploaded only after log-grep) and `lighthouse`. Playwright and the ui-test Node image are pinned by digest in `bin/*`: bump with the packages.

## Proposed decisions / risks / assumptions (for the parent)
- **DECISION:** URL-routed section tabs are a `nav` of links with `aria-current="page"` (TabNav), styled as the 1.8c Tabs; ARIA tabs only for in-page panels.
- **DECISION:** phone bottom bar = Overview · Concepts · Messages · Files + More (Brief); Brief also from Overview.
- **DECISION:** "one primary per view" is a browser check (`expectOnePrimaryPerView`), not a lint rule.
- **DECISION:** ESLint 9.39.5 (jsx-a11y peers ≤ 9); typescript-eslint 8.73.0 and @lhci/cli 0.16.1 taken under the security exception (minimatch GHSA-g3hv-75wg-m249; 13 high advisories in lhci 0.15.1's tree).
- **DECISION:** Lighthouse asserts NFR-P2 as written (simulated throttling, median of 3) on `/dev/ui/shells?section=overview` until Epic 6 seeds a real Overview.
- **DECISION:** dev nginx gzips `/build/` (static only); the root view modulepreloads the current page's chunk.
- **RISK (medium):** NFR-P2 passes only under simulated throttling (754 ms). Applied throttling gives 2876 ms (over 2500 by ~0.4 s): `app.js` is 110 KB gzipped on a 4× CPU, client-rendered. Mitigations: vendor/route splitting, trimming Inertia/axios, a smaller first chunk for the Overview; re-measure on the real Overview (Epic 6) and decide whether NFR-P2 should name applied throttling. Owner input.
- **ASSUMPTION:** production serves `/build/*` compressed (Cloudflare brotli/gzip) with long-lived caching, as the dev nginx now mimics. Verify in Epic 9 (Forge nginx).

## Proposed inventory status (for the parent)
- **C-19:** Laravel column add "app shells (CustomerShell, AdminShell, TabNav, Breadcrumbs, user menu with theme) + `/dev/ui/shells` (1.9); design lint font-size/gradient + ESLint (1.9)". Tests column add `apps/portal/tests/browser/ui-shells.spec.ts`, `tests/js/design-lint.test.ts`. Status: unchanged (`Not started (DV-UX)`); completes with the real screens (Epics 4–7).
- **NFR-P2 / 9.4a:** `bin/lighthouse` + CI `lighthouse` job exist; the page moves to a seeded Overview in Epic 6.

## Proposed UX spec changes (for the parent / owner)
- **§5.1:** name the phone overflow explicitly: a fifth bottom-bar item "More" holding Brief.
- **§11 Tabs:** add "URL-routed sections use a nav of links with `aria-current` (TabNav); ARIA tabs only for in-page panels".
- **§11 Theme switcher:** "in the user menu as radio items; the menu stays open on choice".

## Docs updated
This story record; `apps/portal/README.md` (bin/ui-test, bin/lighthouse, the shells catalogue). Shared tracking files are left to the parent.

## Open items
- **Epic 4:** wire the shells to the real session (`user`, `onSignOut` with `logoutAndVerifySession` behaviour, Account/Invoices routes); admins on customer URLs redirect (UX §5.3 rule 2).
- **Epic 6:** move the Lighthouse URL to a seeded real Overview; decide on the applied-throttling gap (risk above); the Overview's project name uses `DisplayTitle` (UX §8.2), inside `CustomerShell`.
- **Epics 6–7:** feed the "new" dots from the read-state rules; screen specs call `expectOnePrimaryPerView`.
- **When `ui-catalogue.spec.ts` is next touched:** fix 1.8a's comment that says the clock "freezes" the toast timer (still open; that file wasn't touched here).
- **From 2026-11-23:** the Inertia bump (^3.7 / 3.11.0) is still pending (not part of this story).
