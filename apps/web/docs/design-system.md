# Logo Fountain portal: design system

How every screen in `apps/web` looks and is built. Read this before changing any
screen's appearance, and follow it exactly: consistency across screens matters
more than any one screen's flourish.

**Direction:** Linear's layout (a sidebar, a full-width working panel, dense
lists, a properties column) in arlo.sh / Claude colouring (parchment, white and
warm ink, warm charcoal in dark), with the marketing site's brand purple for
what matters. Light and dark are both first-class.

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
   `text-accent`, `bg-accent-soft`, `bg-brand-block` with
   `text-brand-block-fg` / `text-brand-block-fg-2`, and `success` / `warning` /
   `danger` with their `-soft` washes. **Never** `neutral-*`, `gray-*`, `white`, `black` or a
   named colour (`violet-*`, `emerald-*`…) on a migrated screen, and no gradients.
   The only fixed colours are a stage's colour (`project-status-badge.tsx`) and
   the auth artwork panel. The accent is the marketing site's `--purple`
   (`apps/site/src/_includes/css/app.css`): the portal and the public site share
   one brand colour, so changing it means changing both.
2. **Type comes only from the scale**: `text-xs` `text-sm` `text-base` `text-lg`
   `text-xl` `text-2xl` `text-2xl` (Utopia, fluid 16→18px base). **Never**
   `text-[13px]` or any pixel size.
3. **Hierarchy through layout and weight, not boxes.** No card inside a card
   inside a card. One `text-2xl` title per page; sections are `text-lg`.
4. **The accent is for what matters**: the primary action (one per view), the
   current step, focus, the active nav marker, allowance meters. Not decoration.
5. **Behaviour is untouched.** A visual migration changes markup and classes
   only: never data loading, API calls, polling, validation, confirmations,
   redirects, auth checks or copy that states a rule or price.
6. **Both themes, every time.** Check light and dark before you're done.

## Text: which step for what

The scale is Utopia, fluid, a **1.200 ratio at 320px widening to 1.250 at
1400px**. Every named size is a whole step on that ladder — `text-xs` -2 through
`text-4xl` 5 — so each is a clear 20–25% from its neighbours. Do not add a
half-step: `xl` used to sit at 1.5, which left two heading sizes 9.5% apart and
read as noise rather than hierarchy.

| Use | Step | Class |
|---|---|---|
| Page title (one per page) | 3 | `text-2xl font-semibold tracking-tight text-fg` |
| The headline inside a brand block, callout titles | 2 | `text-xl font-semibold tracking-tight` |
| Section title (`<Section>`) | 1 | `text-lg font-semibold tracking-tight` (built in) |
| Body, row titles, field values, descriptions, examples, errors | 0 | `text-base` |
| Secondary lines, metadata, hints, breadcrumbs, nav, buttons, labels | -1 | `text-sm` |
| Badges and status pills only | -2 | `text-xs` |
| Key numbers (allowances) | 3 | `text-2xl font-semibold tabular-nums` |

**Anything a person reads as a sentence is `text-base`.** A description under a
field, an example answer, an error, the body of a confirmation — all `text-base`.
`text-sm` is for the things around the content: labels, hints, metadata,
buttons. `text-xs` is for badges, and nothing else. When most of a screen is
`text-sm` there is no hierarchy left and nothing tells the eye where to start.

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
| `portal-label` | A small section label inside a card (`text-sm`, sentence case) |
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

**Form page** (brief, settings, upload): the detail layout's main column only.
Labels `text-base font-semibold text-fg` so a question leads its own help text,
help `text-base text-fg-2`, fields `portal-field`, one `portal-btn-primary` to
submit at the end, errors in `text-base text-danger` with `role="alert"`. A
multi-step form puts its progress in a rail beside the questions
(`lg:grid lg:grid-cols-[13rem_1fr]`, see the brief), never in a strip of chips
that scrolls sideways.

## The column

Two measures, and no third. **Content is `max-w-[920px]`** — detail pages,
forms, threads, everything a person reads or fills in. **Lists and tables are
`max-w-[1400px]`**, where rows genuinely use the width. There were once three
(720, 920, 1400, split almost evenly), which is no standard at all.

**Thread page** (messages): `PageHeader`; messages as a list in the main column,
each with author `text-sm font-medium`, time `text-xs text-fg-3`, body
`text-base`; the composer pinned at the bottom of the main column in a
`bg-surface` bar with a `portal-field` and a primary send button.

**Auth page**: `AuthShell` as is.

## Callouts

| Meaning | Style |
|---|---|
| The one thing to do on this page | A **brand block**: `rounded-xl bg-brand-block p-6`, a `text-2xl` headline in `text-brand-block-fg`, one line of `text-base` in `text-brand-block-fg-2`, and a white button with `text-[var(--brand-block-btn-fg)]`. See the project hub |
| Success / done | `bg-success-soft` with a matching border |
| Warning / waiting | `bg-warning-soft` |
| Problem / error | `bg-danger-soft text-danger` |
| Neutral info | `FeatureNoticeCard variant="info"` |

**One brand block per page, and only for what the person must do next.** It is a
filled field of colour, not a tinted card: solid colour is what makes it the
first thing seen. Do not put a coloured rule down the side of a card to signal
importance, and do not stack facts inside the block — the properties column
already holds facts. Keep the block to a headline, a line, and a button.

**No uppercase pre-headings.** A small capitalised label above a title restates
the title and earns nothing. Write the title so it stands alone.

## Surfaces

Four levels, and each one has to be *visible* against its neighbour or it is not
a level at all. Every adjacent pair clears **1.10** in both themes; ground to
card is 1.33 in light, 1.18 in dark.

| Token | Light | Dark | For |
|---|---|---|---|
| `bg-app` | `#e5dfcf` | `#121110` | The page ground |
| `bg-panel` | `#ffffff` | `#232120` | A card, a form, a list box — what sits on the ground |
| `bg-surface` | `#f6f4ef` | `#2d2b27` | A subtle fill inside a panel: group headers, insets |
| `bg-surface-2` | `#eee9df` | `#37332f` | A step further: hover, meter tracks |

The washes (`accent-soft`, `success-soft`, `warning-soft`, `danger-soft`) sit at
0.16–0.22 alpha. They were once 0.08–0.12, which on white is a ratio of about
1.12 — present in the stylesheet and absent on the screen. If a tint is worth
applying it has to be worth seeing.

Borders are `border-line` at 0.14 alpha and `border-line-strong` at 0.26. Below
about 0.12 a hairline on a light ground disappears.

## Dark mode

Handled by the tokens: nothing to do on a migrated screen if rule 1 is kept.
Every screen is now migrated, so the interim remap that kept Tailwind's greys
and colour tints legible in dark has been removed from `globals.css`: a
`neutral-*`, `white` or named colour added to a screen from here on will simply
look wrong in dark, with nothing to soften it. Images and white text on imagery
are left alone. A black logo needs a `dark:invert` wrapper.

## Migrating a screen: checklist

- [ ] Wrapped in `PageShell` + `HeaderNav`, with a `PageHeader` (crumbs, actions)
- [ ] Old `mx-auto max-w-[1160px]` main replaced by the page pattern above
- [ ] No `neutral-*`, `white`, `black`, named colours, gradients or `text-[…px]` left
- [ ] Stage shown only with `ProjectStatusBadge`; allowances only with `Allowance`
- [ ] At most one primary button in view, and at most one brand block
- [ ] Every sentence is `text-base`; no `text-xs` outside a badge; no uppercase pre-headings
- [ ] Behaviour unchanged (diff shows markup and classes only)
- [ ] Checked in light and dark, desktop and phone width
- [ ] `npm run typecheck`, `npm run lint`, `npm run test` pass

## Verifying

Screenshots in both themes at 1600×1000 and 390×844, compared with the
reference screen of the same pattern. The theme can be forced with
`localStorage.setItem("lf-theme", "dark" | "light")` before the page loads.
