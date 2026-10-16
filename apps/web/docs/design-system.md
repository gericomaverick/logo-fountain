# Logo Fountain portal: design system

How every screen in `apps/web` looks and is built. Read this before changing any
screen's appearance, and follow it exactly: consistency across screens matters
more than any one screen's flourish.

**Direction:** Linear's layout (a sidebar, a full-width working panel, dense
lists, a properties column) in arlo.sh / Claude colouring (parchment, white and
warm ink, warm charcoal in dark), with one strong vermilion for what matters.
Light and dark are both first-class.

## Reference screens

Build new or migrated screens to match these. Open them side by side.

| Screen | File | Pattern |
|---|---|---|
| Admin queue | `src/app/admin/page.tsx` | List page |
| Admin project | `src/app/admin/projects/[id]/page.tsx` | Detail page with properties column |
| Customer dashboard | `src/app/dashboard/page.tsx` | List page, richer rows |
| Customer project hub | `src/app/project/[id]/page.tsx` | Detail page with properties column |
| Sign in | `src/app/login/page.tsx`, `src/components/auth-shell.tsx` | Auth page |

## Rules

1. **Colours come only from the tokens** (`globals.css`, used as Tailwind
   classes): `bg-app`, `bg-panel`, `bg-surface`, `bg-surface-2`, `border-line`,
   `border-line-strong`, `text-fg`, `text-fg-2`, `text-fg-3`, `bg-accent`,
   `text-accent`, `bg-accent-soft`, and `success` / `warning` / `danger` with
   their `-soft` washes. **Never** `neutral-*`, `gray-*`, `white`, `black` or a
   named colour (`violet-*`, `emerald-*`…) on a migrated screen, and no gradients.
   The only fixed colours are a stage's colour (`project-status-badge.tsx`) and
   the auth artwork panel.
2. **Type comes only from the scale**: `text-xs` `text-sm` `text-base` `text-lg`
   `text-xl` `text-2xl` `text-3xl` (Utopia, fluid 16→18px base). **Never**
   `text-[13px]` or any pixel size.
3. **Hierarchy through layout and weight, not boxes.** No card inside a card
   inside a card. One `text-3xl` title per page; sections are `text-lg`.
4. **Vermilion is for what matters**: the primary action (one per view), the
   current step, focus, the active nav marker, allowance meters. Not decoration.
5. **Behaviour is untouched.** A visual migration changes markup and classes
   only: never data loading, API calls, polling, validation, confirmations,
   redirects, auth checks or copy that states a rule or price.
6. **Both themes, every time.** Check light and dark before you're done.

## Text: which step for what

| Use | Class |
|---|---|
| Page title (one per page) | `text-3xl font-semibold tracking-tight text-fg` |
| Section title (`<Section>`) | `text-lg font-semibold tracking-tight` (built in) |
| Callout titles, large figures in prose | `text-xl font-semibold tracking-tight` |
| Body, row titles, field values, descriptions | `text-base` |
| Secondary lines, metadata, breadcrumbs, nav, buttons | `text-sm` |
| Badges, small labels (`portal-label`) | `text-xs` |
| Key numbers (allowances) | `text-3xl font-semibold tabular-nums` |

Muted text is `text-fg-2` (secondary) or `text-fg-3` (tertiary: timestamps,
hints, empty states). Space uses Tailwind spacing, or `--space-*` tokens for
fluid gutters.

## Components

All in `src/components/`. Use these before writing markup.

| Component | For |
|---|---|
| `PageShell` + `HeaderNav` | Every signed-in page (keep both: the frame draws the sidebar) |
| `PageHeader crumbs actions` (`ui.tsx`) | The sticky top bar: breadcrumbs, then page actions on the right |
| `Section title count actions` (`ui.tsx`) | A titled block in the main column |
| `Property label` (`ui.tsx`) | A label/value line in a `<dl>` in a properties card |
| `EmptyLine` (`ui.tsx`) | Where a list would be when it's empty |
| `Meter` (`ui.tsx`) | A slim progress bar |
| `relativeTime` (`ui.tsx`) | "3 hours ago" for lists; put the full date in `title` |
| `PanelCard title` (`allowances.tsx`) | A card in a properties column |
| `Allowance label usage` (`allowances.tsx`) | Concept/revision allowance: number left, segmented meter, state |
| `ProjectStatusBadge status size` | A project's stage as a coloured pill; the only way to show a stage |
| `FeatureNoticeCard variant` | A notice: `brand` (good news), `success`, `info` |
| Icons (`icons.tsx`) | Inline 16px icons; add any new one there, Lucide-style |
| `portal-btn-primary` / `-secondary` / `-ghost` / `-danger` | Buttons (36px, `text-sm`). One primary per view |
| `portal-field` | Inputs, selects, textareas (`text-base`, so phones don't zoom) |
| `portal-label` | A small uppercase section label inside a card |
| `portal-link` | An inline text link |

## Page patterns

**List page** (queue, dashboard): `PageHeader` with one crumb; a title block
(`pt-8 pb-5`) with a one-line summary; then one rounded bordered box
(`rounded-xl border border-line bg-panel`) holding group header rows
(`h-11 bg-surface text-sm font-semibold` + count) and rows (`border-b
border-line`, hover `bg-surface`, the whole row a link). Inset from the panel
edges: `mx-auto max-w-[1400px] px-4 md:px-8 lg:px-10`. Never `overflow-hidden`
on that box (it breaks sticky group headers); round the first header and last
row instead, as the reference screens do.

**Detail page** (a project, a concept): `PageHeader` with crumbs back to the
list and the page's actions. Below it, two columns: main
(`flex-1 px-4 py-6 md:px-8 lg:py-8`, content `mx-auto max-w-[920px]
space-y-10`) and a properties column (`lg:w-[384px] border-l bg-surface
space-y-4 p-5`) of `PanelCard`s: the facts that matter most first. On phones the
column drops below.

**Form page** (brief, settings, upload): the detail layout's main column only,
`max-w-[720px]`. Labels `text-sm font-medium text-fg`, help `text-sm text-fg-3`,
fields `portal-field`, one `portal-btn-primary` to submit at the end, errors in
`text-danger` with `role="alert"`.

**Thread page** (messages): `PageHeader`; messages as a list in the main column,
each with author `text-sm font-medium`, time `text-xs text-fg-3`, body
`text-base`; the composer pinned at the bottom of the main column in a
`bg-surface` bar with a `portal-field` and a primary send button.

**Auth page**: `AuthShell` as is.

## Callouts

| Meaning | Style |
|---|---|
| Next step / primary call to action | `border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,var(--panel))]`, a 4px accent rule down the left (`w-1 bg-accent`), an uppercase `text-accent` kicker, a primary button (see the project hub) |
| Success / done | `bg-success-soft` with a matching border |
| Warning / waiting | `bg-warning-soft` |
| Problem / error | `bg-danger-soft text-danger` |
| Neutral info | `FeatureNoticeCard variant="info"` |

## Dark mode

Handled by the tokens: nothing to do on a migrated screen if rule 1 is kept.
`globals.css` has an *interim* remap that keeps unmigrated screens legible in
dark (greys flipped, colour tints as washes). It is not a licence to use those
classes; it is removed once every screen is migrated. Images and white text on
imagery are left alone. A black logo needs a `dark:invert` wrapper.

## Migrating a screen: checklist

- [ ] Wrapped in `PageShell` + `HeaderNav`, with a `PageHeader` (crumbs, actions)
- [ ] Old `mx-auto max-w-[1160px]` main replaced by the page pattern above
- [ ] No `neutral-*`, `white`, `black`, named colours, gradients or `text-[…px]` left
- [ ] Stage shown only with `ProjectStatusBadge`; allowances only with `Allowance`
- [ ] At most one primary button in view
- [ ] Behaviour unchanged (diff shows markup and classes only)
- [ ] Checked in light and dark, desktop and phone width
- [ ] `npm run typecheck`, `npm run lint`, `npm run test` pass

## Verifying

Screenshots in both themes at 1600×1000 and 390×844, compared with the
reference screen of the same pattern. The theme can be forced with
`localStorage.setItem("lf-theme", "dark" | "light")` before the page loads.
