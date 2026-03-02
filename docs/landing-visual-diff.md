# Landing / Work Visual Structural Diff

## What changed

### 1) Design token system (HYROS-like)
- Shifted from dark neon styling to a black/white marketing palette.
- Applied layout width target of `max-w-[1160px]`.
- Applied page padding rhythm: `px-8` (32px) and `md:px-12` (48px).
- Standardized card shape to `rounded-[20px]`.
- Standardized borders to `border border-black` (1px).
- Introduced muted text tone via `#565656` (`.text-muted`).
- Introduced typography pairing:
  - Display: `Fraunces` (`--font-fraunces`, `.font-display`)
  - Body: `Inter` (`--font-inter`)
- Enforced headline style behavior through `.font-display` (`line-height: 1.2`, near-zero letter spacing).

### 2) Landing page (`apps/web/src/app/page.tsx`) structure
- Rebuilt into centered headline-first composition.
- Added HYROS-style hero hierarchy:
  - small uppercase preheadline
  - large centered display headline
  - centered supporting copy
  - two-button CTA row (filled + outlined)
  - stat card row below hero
- Reworked logo showcase into a bordered logo card grid (20px radius) with tighter Framer-like spacing rhythm.
- Replaced simple segment blocks with icon-led segmented cards and repeated `Learn more` links.
- Added testimonial and process blocks with repeated `Learn more` link treatment.
- Kept existing placeholder copy while changing visual hierarchy and section flow.
- Added a large closing CTA section using image + gradient background and two CTAs (primary filled, secondary translucent outlined).

### 3) Work page (`apps/web/src/app/work/page.tsx`) structure
- Converted top area into centered headline composition matching landing style.
- Restyled filter block and filter pills to monochrome bordered system.
- Reworked project cards into bordered 20px cards with muted metadata and repeated `Learn more` links.
- Added HYROS-style closing CTA band with image/gradient background and two-button treatment.

### 4) Global style + font pipeline
- Updated `layout.tsx` to load `Fraunces` + `Inter` via `next/font/google`.
- Updated `globals.css` theme tokens to use the new font variables and muted color utility.
- Removed previous Geist/dark defaults in favor of marketing-page-specific base styles.

## Files touched
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/work/page.tsx`
- `docs/landing-visual-diff.md`
