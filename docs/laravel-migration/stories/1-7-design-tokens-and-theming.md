# Story 1.7: Design tokens and theming

**Status:** review (2026-11-20) · **DoD variant:** Laravel-only · **Epic:** 1 · **Covers:** C-19 (tokens and theme part), NFR-A4, ADR-022, UX §8 · **Gate:** `@visual` · **After:** 1.1a

## Acceptance criteria (epics.md §1.7)
1. **Given** system dark mode, **then** the first paint is dark (Playwright with emulated `prefers-color-scheme`). ✓
2. The UX §8.1 contrast pairs are asserted by a unit test. ✓
3. Inter, Sfizia and Geist Mono are self-hosted. ✓
4. Sfizia only via `DisplayTitle` (three uses, ≥ 32/28 px, UX §8.2); the L7b lint rejects any other use of the display font token. ✓

## Scope
- **In:** §8.1 colour tokens (light/dark), §8.2 type (fonts, fluid scale), §8.3 radius/shadow/motion/content width, theme preference (System/Light/Dark, stored, no flash), `ThemeSwitcher`, `DisplayTitle`, L7b lint (first rules), contrast and browser tests, `Home` as a token showcase.
- **Out:** the rest of C-19 (app frame, header nav, notice cards, status badges → 1.8a/1.8b/1.9, Epic 6); `/dev/ui` (1.8a); ESLint, pixel-font-size rule, CI `ui` job, L7 screenshot baselines (1.9 and each screen story).

## Inventory scope
C-19: tokens + theme switcher done here; the frame/nav/badges parts stay with 1.8–1.9 and Epic 6. NFR-A4: met for the shell (baselines per screen come with each screen).

## Next.js source read
`apps/web/public/theme-init.js`, `apps/web/src/components/theme-switcher.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css` (font-face, `data-theme`, `--font-display`). Docs: epics §1.7, ux-design.md (all, §8, §11, §13), `ux/design-directions.html` (direction A), ADR-022, prd NFR-A4, inventory C-19, 02-test-strategy L7/L7a/L7b, research-technical §1 pin policy.

## Behaviour notes
- Next stores the choice in `localStorage["lf-theme"]` (`system`|`light`|`dark`; anything else = system) and sets `<html data-theme>` (resolved) and `data-theme-pref` from a **synchronous external script** (`/theme-init.js`, CSP `'self'`) before hydration (`theme-init.js:5-15`).
- Its switcher is a `radiogroup` "Theme" with System/Light/Dark radios; it follows OS changes only while the switcher is mounted and on System (`theme-switcher.tsx:51-57`).
- Storage errors are swallowed (private mode → choice lasts for the page).
- Fonts in Next: Inter via `next/font/google` (build-time download, self-served), Sfizia/Geist Mono from `public/fonts`.

## Laravel implementation
| Piece | Where |
|---|---|
| Tokens (`@theme static`; Tailwind default colours/fonts/sizes/radii/shadows removed with `initial`) | `apps/portal/resources/css/app.css:66-130` |
| Dark overrides + no-JS `prefers-color-scheme` fallback (must stay identical; tested) | `app.css:132-187` |
| Base: bg/fg on `html`, focus ring (§13), reduced motion (§8.3) | `app.css:189-216` |
| Fluid type scale (Utopia 1.2@320 → 1.25@1400, 16→18 px) | `app.css:94-112` |
| `@font-face` (swap, unicode-range latin / latin-ext) | `app.css:25-63` |
| Theme before first paint (same key/attributes as Next) | `apps/portal/public/theme-init.js`, loaded first in `resources/views/app.blade.php:8-9` with `<meta name="color-scheme" content="light dark">` |
| Preference API, live OS follow (global, not only while the switcher is mounted) | `resources/js/lib/theme.ts`, called from `resources/js/app.tsx:9` |
| Theme switcher (radiogroup "Theme") | `resources/js/Components/ui/ThemeSwitcher.tsx` |
| `DisplayTitle` (`use`: project-overview / auth / celebration; `text-3xl lg:text-4xl`, 400, no className; dev warning if > 1 mounted) | `resources/js/Components/ui/DisplayTitle.tsx` |
| Preloads: Inter on every page; Sfizia only for pages in `config/ui.php` `display_font_pages` | `app.blade.php:11-14`, `config/ui.php` |
| Fonts in the Vite manifest (for `Vite::asset`) | `app.tsx:7` |
| Showcase page (one DisplayTitle) | `resources/js/Pages/Home.tsx` |
| L7b design lint | `apps/portal/scripts/design-lint.mjs` (rules display-font, display-title, raw-colour; allowlist `DISPLAY_TITLE_CALLERS`) |
| Runners | `bin/ui-test` (Node 24 container: lint, unit tests, tsc), `bin/browser-test` (Playwright 1.64.1 image, host network, `PORTAL_HTTP_PORT`); npm scripts `lint:design`, `test:unit`, `test:browser` |

**Fonts (self-hosted, no CDN):**
| Font | Source | Files (`resources/fonts/`) |
|---|---|---|
| Inter 4 variable | npm `@fontsource-variable/inter@5.3.0` (2026-07-19; tgz sha256 `d26710dd…af09a14`), OFL | `inter/inter-latin-wght-normal.woff2` (48 KB), `inter-latin-ext-…` (85 KB, only loads for those glyphs), `OFL.txt` |
| Geist Mono variable | npm `@fontsource-variable/geist-mono@5.3.0` (2026-07-19; sha256 `af7a9f15…85736a70`), OFL | `geist-mono/…latin…` (23 KB), `…latin-ext…` (15 KB), `OFL.txt` |
| Sfizia Regular | `apps/web/public/fonts/atipo-sfizia-regular.ttf` (sha256 `63a7ff2b…a6481f`), owner licence 2026-11-19 | `sfizia/atipo-sfizia-regular.woff2` (61 KB → 17.6 KB) |

Sfizia conversion (lossless, no subsetting): `python:3.13-slim` container, `pip install fonttools==4.68.0 brotli==1.2.1`, `python -m fontTools.ttLib.woff2 compress -o atipo-sfizia-regular.woff2 atipo-sfizia-regular.ttf`. Checked: 441 glyphs in both, identical cmap, `OS/2.fsType = 0` (installable embedding). Only Regular is shipped (the italic isn't allowed by §8.2). Inter's GitHub release zip was not used (download blocked in this session), hence the fontsource npm builds (Google Fonts builds of Inter 4 / Geist Mono).

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| OS theme follow | only while a `ThemeSwitcher` is mounted | on every page (`theme.ts` `followSystemTheme`) | §8.1: system is the default; pages without a switcher shouldn't go stale | DV-UX |
| No-JS theme | light (no `data-theme`) | follows `prefers-color-scheme` via CSS | NFR-A4 "never the wrong theme" | DV-UX |
| Tokens/palette | mid-redesign tokens | UX §8 direction A tokens | redesign | DV-UX |

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 unit (node:test) | `tests/js/contrast.test.ts`: WCAG maths reference values; token set equals §8.1 value for value; no-JS dark block = dark block; 38 pair checks (each ≥ 4.5 text / ≥ 3 UI and within 0.06 of the §8.1 figure); accent focus ring ≥ 3:1; text-3xl ≥ 28 px phone / ≥ 32 px desktop; text-base ≥ 16 px | NFR-A4, C-19 |
| L1 unit (node:test) | `tests/js/design-lint.test.ts`: real tree clean; display font token rejected outside DisplayTitle (classes, var, family name, in CSS too); DisplayTitle only in allowlisted files, never admin; raw hex/rgb/palette classes rejected | C-19 (L7b) |
| L1 Pest | `tests/Feature/ThemeLayoutTest.php`: theme-init before stylesheets, color-scheme meta; Sfizia preload only on display pages | NFR-A4 |
| L7 Playwright `@visual` | `tests/browser/theme.spec.ts`: system dark → first frame dark (`rgb(18,18,17)`, `data-theme=dark`); system light → light; stored light beats system dark; stored dark beats system light; no-JS + dark → dark via CSS; switcher persists, survives reload with a dark first frame, System follows emulated OS change; fonts all same-origin and loaded (Inter, Geist Mono, Sfizia), one Sfizia preload, exactly one `[data-display-title]`, Sfizia 400 at ≥ 32 px (1280) / ≥ 28 px (390), body Inter | C-19, NFR-A4 |
| L7a axe `@visual` | same file: no serious/critical axe violations, light and dark | NFR-A1 |
Test-port ledger rows resolved: none.

**Where the browser test lives, and why:** `apps/portal/tests/browser` with its own `playwright.config.ts` (projects desktop 1280 and phone 390), not `tests/parity`. 02-test-strategy says L7/L7a are **Laravel only**; the parity suite is behavioural and runs against both targets, so a Laravel-only design check would only be noise in its Next run and its coverage gate.

**How "first paint" is measured:** an init script (runs before any page script) registers a `requestAnimationFrame` callback that records `data-theme` and the computed `html` background; a frame isn't rendered until render-blocking CSS has loaded, so this is the state of the first painted frame. Mutation check: with `public/theme-init.js` removed, all 4 first-paint tests fail.

## Test evidence
Stack: `COMPOSE_PROJECT_NAME=lf-1-7`, `PORTAL_HTTP_PORT=18087`, Vite 15177.
- `bin/ui-test`: design lint **clean**; node:test **55 passed / 0 failed** (4 suites); `tsc --noEmit` ✓.
- `PORTAL_HTTP_PORT=18087 bin/browser-test`: **18 passed / 0 failed** (9 tests × desktop + phone) against the **Vite dev server**, and **18 passed** against a **production build** (`npm run build`, no `public/hot`).
- `bin/test`: Pint ✓, Larastan level 9 "No errors", Pest **7 passed (19 assertions)**, also with no `public/build` and no `public/hot`.
- `vite build`: CSS 15.4 KB (4.2 KB gzip); fonts fingerprinted into `public/build/assets`.

**Not run, and why:** L7 screenshot baselines (Home is a throwaway showcase; baselines are approved per real screen from 1.8+). Parity suite (no behavioural change, Laravel-only gate). CI (no `ui` job until 1.9).

## Gotchas
- **Pages never rendered in the Vite dev server**: `@viteReactRefresh` was missing from `app.blade.php` (`@vitejs/plugin-react can't detect preamble`). Fixed. Pest didn't catch it (it doesn't run JS). → propose for AGENTS.md.
- **Vite dev server on a non-default port:** `vite.config.ts` hard-coded origin `:5173` and CORS allowed only the `APP_URL` origin, so parallel stacks (`PORTAL_*_PORT`) got blocked module scripts/fonts. Now origin/HMR use `PORTAL_VITE_PORT` (passed in `compose.yaml`) and CORS allows any `localhost`/`127.0.0.1` port. Browse the app at `http://localhost:<port>`, not `127.0.0.1`.
- **Pest needed Vite**: rendering a page threw `ViteManifestNotFoundException` unless Vite was running or a build existed. `tests/TestCase.php` now calls `withoutVite()`. → AGENTS.md.
- **The axe check caught a real issue**: inline links coloured `accent-text` without an underline fail `link-in-text-block` (accent-text vs fg is < 3:1). §11 says "underline on hover and focus"; inline links in text must be underlined **always**. Showcase fixed; 1.8a's Link `inline` variant must do the same (open item / UX §11 wording).
- Tailwind's `font-display` class name collides with the CSS property `font-display: swap`; the lint allows the property only as a declaration line in the token file.
- `@theme static` plus `--color-*: initial` means palette classes like `bg-white` silently generate nothing; the lint reports them so they don't fail silently.
- Lightning CSS (Tailwind 4) rewrites `color-scheme` blocks with `--lightningcss-light/dark` vars; harmless, but don't grep the built CSS for the source shape.
- `public/hot` survives `docker compose stop vite`; delete it to test the build.
- `npm ci` in the vite container reruns on start, so it picks up new devDeps (Playwright's npm package doesn't download browsers; browsers come from the pinned image).

## Proposed AGENTS.md promotions (for the parent)
1. Tokens only in `resources/css/app.css`; components use semantic utilities; run `bin/ui-test` before committing UI.
2. Sfizia only via `DisplayTitle`; a new use needs a UX §8.2 change plus `DISPLAY_TITLE_CALLERS` (`scripts/design-lint.mjs`) and `config/ui.php` `display_font_pages`.
3. Browser checks: `bin/browser-test` against `http://localhost:$PORTAL_HTTP_PORT` (not 127.0.0.1).
4. `@viteReactRefresh` must stay before `@vite` in `app.blade.php`; Pest uses `withoutVite()`.

## Proposed inventory status (for the parent)
- C-19 → keep `Not started (DV-UX)` overall, Laravel column: "tokens, theme switcher, DisplayTitle (1.7); frame/nav/badges pending 1.8–1.9, Epic 6"; Tests column add `apps/portal/tests/browser/theme.spec.ts`, `tests/js/contrast.test.ts` (L7/L1, Laravel-only).

## Proposed decisions / risks / assumptions (for the parent)
- DECISION: Laravel-only browser checks (L7/L7a) live in `apps/portal/tests/browser` with their own Playwright config, run via `bin/browser-test` in `mcr.microsoft.com/playwright:v1.64.1-noble`; the parity suite stays behavioural.
- DECISION: front-end unit tests use `node:test` with Node 24 type stripping (zero deps) for now; Vitest arrives with 1.8c (`usePolling`) if needed. Wired via `bin/ui-test` (not `bin/test`, which stays PHP).
- DECISION: theme stays in an external `public/theme-init.js` (not inline) so CSP can use `'self'` without a hash or nonce (ADR-027 / story 1.6).
- DECISION: Inter and Geist Mono from `@fontsource-variable/*@5.3.0` (npm, vendored WOFF2 + OFL), latin + latin-ext only.
- ASSUMPTION: the Sfizia licence allows serving a WOFF2 conversion (format change only, no glyph changes; fsType 0). Owner to confirm against the Atipo EULA.
- RISK (low): customers using Cyrillic/Greek/Vietnamese names get system fallback glyphs (only latin + latin-ext subsets shipped).

## Docs updated
Story record only (shared tracking files left to the parent per instructions). `apps/portal/README.md` gained the `bin/ui-test` / `bin/browser-test` lines.

## Open items
- 1.8a: Link `inline` variant always underlined (axe `link-in-text-block`); move the ThemeSwitcher onto Radix radio group (arrow-key navigation) if 1.8a adopts it for radios; add `/dev/ui`.
- 1.9: extend `scripts/design-lint.mjs` (pixel font sizes, gradients, ESLint rule) and run `bin/ui-test` + `bin/browser-test` in the CI `ui` job; pin the Playwright image by digest.
- Epic 6: replace `Home` in `DISPLAY_TITLE_CALLERS` and `config/ui.php` with the real Overview, auth layout and celebration banner.
- Owner: confirm the Sfizia EULA covers WOFF2 conversion (see assumption).
- UX doc nit: §8.1 lists two dark `border` ratios (3.93/3.61); the third (vs sunken) is 4.10. Two light figures round up by 0.05 (accent-text on accent-soft 6.05 → "6.1", danger on soft 5.75 → "5.8"); the test tolerates 0.06.
