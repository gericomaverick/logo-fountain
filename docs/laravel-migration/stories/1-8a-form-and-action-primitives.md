# Story 1.8a: Form and action primitives

**Status:** review (2026-11-20) · **DoD variant:** Laravel-only · **Epic:** 1 · **Covers:** UX §11 (form and action rows), §12, §13 · **Gate:** `@visual` · **After:** 1.7
**Branch:** `worktree-agent-afc3019ad2d7823f5` (not pushed) · **Stack:** `COMPOSE_PROJECT_NAME=lf-1-8a`, HTTP 18088, Vite 15178

## Acceptance criteria (epics.md §1.8a)
1. Button, Link, Field, Input, Textarea, Select (Radix), Checkbox, Radio, Choice chips, Dialog and Confirm (incl. acknowledgement and type-to-confirm), Menu, Sheet, Toast, Inline alert. ✓ (table below)
2. Every variant and state is in `/dev/ui` in both themes. ✓ (light/dark via the switcher; L7 baselines per theme)
3. axe finds no serious issues. ✓ (page + every open overlay, both themes, both viewports)
4. Dialog traps and restores focus. ✓ (`ui-catalogue.spec.ts` "a dialog traps focus…", "while submitting…", sheet)

## Primitives vs the UX §11 list
| §11 / epics item | Variants and states (§11) | File (`apps/portal/resources/js/Components/ui/`) |
|---|---|---|
| Button | primary · secondary · ghost · danger; sm/md; loading (keeps label); disabled-with-reason; 44 px on touch | `Button.tsx` |
| Link | inline (always underlined) · standalone (underline on hover/focus) | `Link.tsx` |
| Form field | label + control + help + error + counter, `aria-describedby` | `Field.tsx` (`Field`, `FieldError`, `FieldGroup`, `controlClass`) |
| Input, Textarea | default · focus · error · disabled · read-only | `Input.tsx`, `Textarea.tsx` |
| Select★ | same, Radix Select | `Select.tsx` |
| Checkbox | same | `Checkbox.tsx` |
| Radio group | same (native radios, arrow keys) | `RadioGroup.tsx` |
| Choice chips | single (radios) / multiple (checkboxes); same states | `ChoiceChips.tsx` |
| Dialog★ | default · danger; busy blocks closing; focus trap/restore | `Dialog.tsx` |
| Confirm dialog | acknowledgement checkbox (§12 level 3); danger + type-to-confirm (level 4) | `ConfirmDialog.tsx` |
| Menu★ / Dropdown | items, link items, danger item, disabled, label, separator | `Menu.tsx` |
| Sheet★ (phone) | bottom sheet (Radix Dialog variant, ADR-022) | `Sheet.tsx` |
| Toast | success (`role=status`, 5 s, paused on hover/focus) · error (`role=alert`, stays) | `Toast.tsx` (`ToastProvider`, `useToast`) |
| Inline alert | info · success · warning · danger; optional live announce | `InlineAlert.tsx` |
| (§12 Forms) Error summary | top-of-form summary, focused, links to fields | `ErrorSummary.tsx`. Not in the epics list; §12 requires it and it is the Field's companion, so built here (flag if 1.9 or a screen story should own it) |
| Theme switcher (1.7) | now single-choice Choice chips: native radios, arrow keys (1.7 open item) | `ThemeSwitcher.tsx` |

Not built (other stories): Turn banner, Stage tracker, Status pill, Allowance meter, Empty state, Skeleton (1.8b); Card/Panel, Concept card/viewer, Thread, File card, Data table, Properties panel, Upload dropzone (1.8c, or with their screens); Tabs★ (shells, 1.9). Card/Panel is not in 1.8a/b/c's lists: **gap, see Open items.**

## Inventory scope
No inventory row is completed by this story (UX design-system work, DV-UX). C-19's frame/nav/badges remain with 1.8b–1.9 and Epic 6. Proposed Tests-column addition for C-19 below.

## Next.js source read
`apps/web/src/components/ui.tsx`, `theme-switcher.tsx` (behaviour only; the look is the redesign). No Next type-to-confirm exists (new for UX §12 level 4). Docs: epics §1.7–1.9, ux-design §6, §8, §11–§13, `ux/design-directions.html` (A), ADR-022, 02-test-strategy L7/L7a/L7b, research-technical §1 pin policy, story 1.7 record, AGENTS.md §8.

## Behaviour notes
- Design primitives, no server behaviour. Rules followed: one primary per view (§5), verb-first labels (§12), disabled always says why (§12), loading keeps a label and never a wordless spinner (§7, §8.3 "no looping animation", so no spinner at all), validate on blur/submit and keep typed input on error (§12), colour never alone (§8.1: icons + hidden "Error:"/tone prefixes + ticks on selected chips), focus 2 px accent ring (§13), 44 px touch / 24 px pointer targets (§13), input text ≥ 16 px (§8.2), motion only on entrances, off with reduced motion (§8.3).
- Type-to-confirm: exact, case-sensitive, surrounding spaces ignored (`lib/ui.ts` `confirmBlocker`).
- Character counter: never truncates (`maxLength` isn't set); shows "N characters too many" and marks the field invalid; the live region speaks only in the last 10% (min 10 chars), debounced 600 ms.

## Laravel implementation
| Piece | Where |
|---|---|
| Pure logic (cx, describedBy, characterCount, confirmBlocker, usesNativeAnchor, toast list, alert tone labels) | `resources/js/lib/ui.ts` |
| Primitives | `resources/js/Components/ui/*.tsx` (table above) |
| Motion tokens `--animate-fade-in` (150 ms), `--animate-sheet-in` (250 ms) + keyframes | `resources/css/app.css` (`@theme`, after `--duration-panel`) |
| Catalogue page | `resources/js/Pages/Dev/Ui.tsx` |
| Route, **gated to `local` and `testing`** (`app()->environment([...])` when routes load, so `route:cache` in production omits it) | `routes/web.php:9-14` |
| Lazy page resolution (one chunk per page; the catalogue is 138 KB on its own, the shared bundle 351 KB instead of 499 KB) | `resources/js/app.tsx` |
| Pins (exact, released ≤ 2026-10-30, `npm audit --omit=dev` 0 vulns): `@radix-ui/react-dialog 1.3.1` (2026-10-12), `@radix-ui/react-dropdown-menu 2.2.1` (2026-10-12), `@radix-ui/react-select 2.4.1` (2026-10-12), `lucide-react 1.65.0` (2026-10-30) | `package.json`, `package-lock.json` (commit `6060ca2`) |
| Playwright: phone project emulates touch (`hasTouch`, so `pointer: coarse`); screenshot defaults (animations off, caret hidden, css scale); baselines in `tests/browser/__screenshots__/<spec>/<name>-<project>.png` | `playwright.config.ts` |
| README: catalogue URL, `--update-snapshots` | `apps/portal/README.md` |

Library choices: ADR-022 names Radix for dialog, menu and select ("a phone sheet is a dialog variant"); UX §8.3 names Lucide. Checkbox, radio and chips are native inputs (forms, keyboard and AT for free; arrow keys come from same-name radios). Toast is hand-rolled (not in ADR-022's Radix list; Radix Toast would auto-dismiss errors and use one role for both).

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Theme switcher semantics | `role=radiogroup` of buttons with `role=radio`, no arrow keys | fieldset of native radios (role `group` named "Theme"), arrow keys | 1.7 open item; native keyboard model | DV-UX |
| Primitives' look and states | mid-redesign `ui.tsx` | UX §11 direction A | redesign | DV-UX |

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 node:test | `tests/js/ui-logic.test.ts` (17): describedBy/cx, counter text/overage/announce threshold, confirm blockers (ack, exact phrase, order), Link anchor vs Inertia, toast timing/roles/cap/dedupe, alert tone labels | NFR-A1 |
| L1 node:test | `tests/js/contrast.test.ts` "story 1.8a component pairs" (26): fg on each `*-soft`, danger text on bg/surface, accent-fg on danger and on accent-text (hover), success/danger icons, chip border, read-only fill, danger hover at 90% | NFR-A1, NFR-A4 |
| L2 Pest | `tests/Feature/DevUiRouteTest.php`: `/dev/ui` 200 renders `Dev/Ui` in testing; a real `APP_ENV=production` `route:list` process has no `dev/ui` (and a `local` one does) | none |
| L7 `@visual` | `tests/browser/ui-catalogue.spec.ts` "L7 visual baselines": full catalogue + dialog, confirm-acknowledgement, confirm-type-to-confirm, menu, select, sheet, toasts; × light/dark × desktop 1280/phone 390 = **32 baselines** | NFR-A4 |
| L7a `@visual` | same file: axe (wcag2a/aa/21aa/22aa, serious+critical) on the catalogue and every open overlay, both themes | NFR-A1 |
| L7 behaviour `@visual` | same file: dialog focus trap (Tab/Shift+Tab) + Esc + restore; busy dialog ignores Esc/outside/Close, then restores focus; confirm L3 (blocked with reason, ack, pending, error kept open, input kept); L4 (phrase exact, restore, reset on reopen); sheet; menu keyboard + restore; select label/description/keyboard/focus-trap/read-only/disabled; field `aria-describedby`/`aria-invalid`/counter; error summary focus + link → field, typed input kept; radios arrows skip disabled, read-only ignores; checkbox row/read-only/disabled; chips multi + single arrows; theme switcher arrows; button loading/disabled semantics + focus kept; link underlines; focus ring 2 px; targets ≥ 24 px and buttons ≥ 44 px on touch; toast 5 s / error stays / dismiss; one h1, no DisplayTitle | NFR-A1, NFR-A2 |
| L7 `@visual` (1.7, adjusted) | `tests/browser/theme.spec.ts`: switcher found as `group "Theme"`; waits for the lazy page render before reading fonts and running axe | C-19 |
Test-port ledger rows resolved: none.

## Test evidence
Stack `lf-1-8a` (ports above), worktree at `c4ad680`+docs.
- `bin/ui-test`: design lint **clean**; node:test **98 passed / 0 failed** (55 from 1.7 + 17 logic + 26 pairs); `tsc --noEmit` ✓.
- `bin/test`: check-agents-guide ✓, Pint ✓ (65 files), Larastan level 9 "No errors", Pest **194 passed (570 assertions)** (192 + 2 new).
- `PORTAL_HTTP_PORT=18088 bin/browser-test`: **96 passed / 0 failed** (48 tests × desktop + phone) against the Vite dev server; `--repeat-each=3` **288 / 288**; against a **production build** (`npm run build`, Vite stopped, no `public/hot`) **96 / 96 on the same baselines**.
- `npm audit --omit=dev`: 0 vulnerabilities. `vite build`: CSS 28.9 KB (6.8 KB gzip).

**Not run, and why:** parity suite (no behavioural change; Laravel-only gate). CI (no `ui` job until 1.9). Manual screen-reader passes (UX §13: before launch). Lighthouse (1.9).

## Gotchas
- **Radix DropdownMenu is modal by default** and `aria-hidden`s the page while it stays focusable → axe `aria-hidden-focus` (serious). The Menu uses `modal={false}` (the ARIA menu-button pattern isn't modal; Esc/Tab/outside still close it). → propose for AGENTS.md.
- **Radix Select has no non-modal mode**, same axe rule while open. Focus can't reach the hidden page (the test asserts Tab/Shift+Tab stay in the listbox), so the overlay axe check skips only `aria-hidden-focus`, only for the open select. Recorded in the spec.
- **`aria-readonly` isn't allowed on `radio`** (axe `aria-allowed-attr`). Read-only radio groups say so in the legend/hint; checkboxes keep `aria-readonly`.
- **Radix Dialog only restores focus to its own `Trigger`.** `useOverlayBehaviour` remembers the opener in `onOpenAutoFocus` and restores it in `onCloseAutoFocus`, so dialogs opened from code also restore.
- **Toasts are hidden from AT while a modal is open** (Radix aria-hides everything outside). Inside a dialog use `InlineAlert` (ConfirmDialog does). → propose for AGENTS.md.
- **Text inside a `<label>` must not be `aria-hidden`**, or the input loses its accessible name (caught while building chips).
- **Playwright won't click `aria-disabled` buttons** (waits for "enabled"); tests that prove a blocked button does nothing use `click({ force: true })`.
- **Tailwind 4 `hover:` is `@media (hover: hover)`**, so it never applies with touch emulation; check focus instead on the phone project.
- **Pointer position leaks into screenshots** (hover border under the cursor after clicking a trigger): park the mouse before `toHaveScreenshot`.
- **Lazy Inertia pages render a tick after `goto`**: wait for page content before `document.fonts.ready` or axe, or the check passes on an empty root. → propose for AGENTS.md.
- `--radius-*: initial` keeps Tailwind's static `rounded-full` (used for radios).
- Danger has no darker token: hover is `bg-danger/90`; its label contrast is unit-tested.

## Proposed AGENTS.md promotions (for the parent)
1. UI primitives live in `Components/ui` and are shown in `/dev/ui` (local/testing only, `routes/web.php`); a new primitive or state gets a catalogue entry and an L7 baseline (`bin/browser-test --update-snapshots`, baselines in `tests/browser/__screenshots__`).
2. Radix menus are `modal={false}`; inside modal dialogs report errors with `InlineAlert`, not toasts.
3. Disabled buttons use `disabledReason` (aria-disabled, focusable, reason linked); there is no bare `disabled`.
4. Browser tests: wait for page content before fonts/axe (pages load lazily); park the pointer before screenshots; the phone project emulates touch.

## Proposed UX spec changes (for the parent / owner)
- §8.1 addendum: the extra pairs in `contrast.test.ts` "story 1.8a component pairs" (fg on each `*-soft` for alert bodies; danger text on bg/surface for field errors; accent-fg on danger and on accent-text). All pass AA in both themes.
- §11 Link: say "inline links are always underlined; standalone links underline on hover and focus" (1.7 finding; built that way).
- §11: add "Error summary (§12 Forms)" to the component table.
- §11 Card/Panel and Tabs: assign to a story (Card/Panel isn't in 1.8a/b/c's lists; Tabs presumably 1.9 shells).

## Proposed inventory status (for the parent)
- C-19: Tests column add `apps/portal/tests/browser/ui-catalogue.spec.ts`, `tests/js/ui-logic.test.ts` (L7/L7a/L1, Laravel-only); Laravel column add "form and action primitives + /dev/ui (1.8a)". Status unchanged.

## Proposed decisions / risks / assumptions (for the parent)
- DECISION: Radix for Dialog/Sheet/Menu/Select only (ADR-022); native inputs for checkbox, radio and chips; Toast hand-rolled (success `status` 5 s, error `alert` sticky). Pins `@radix-ui/react-dialog 1.3.1`, `react-dropdown-menu 2.2.1`, `react-select 2.4.1`, `lucide-react 1.65.0`.
- DECISION: `/dev/ui` is registered only when `APP_ENV` is `local` or `testing` (routes load time; production `route:list` test).
- DECISION: Inertia pages resolve lazily (code-split per page).
- DECISION: L7 baselines are generated and compared only in the pinned Playwright image (`bin/browser-test`), `tests/browser/__screenshots__`.
- RISK (low): Radix Select's always-modal `aria-hidden` trips axe `aria-hidden-focus` while open; exempted only for that state, focus trap asserted. Revisit if Radix adds a non-modal select.

## Docs updated
This story record; `apps/portal/README.md` (catalogue URL, `--update-snapshots`). Shared tracking files left to the parent per instructions.

## Open items
- 1.9: add the CI `ui` job (run `bin/ui-test` + `bin/browser-test`, including the 32 baselines); decide whether the "one primary button per view" rule gets a lint (it isn't in 1.8a or 1.9's lint list; the catalogue page breaks it on purpose); `ToastProvider` goes into the app shells.
- 1.8b/1.8c/1.9 or the screen stories: Card/Panel and Tabs★ are unassigned in §11 → epics.
- Owner/UX: approve the §8.1 addendum pairs and the §11 wording above.
- Later: if a menu item opens a dialog, check that focus returns to the menu trigger (Radix menu + dialog ordering); not exercised yet.
