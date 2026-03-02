# reference → Logo Fountain section map

Reference source: `workspace/tmp/reference.html` (Framer export snapshot).

## Observed reference homepage cadence (high-level)

1. Hero (centered headline + dual CTAs)
2. Immediate proof/trust block (testimonial/credibility + key numbers)
3. Brand/customer logo wall
4. Audience/problem segmentation cards
5. Additional testimonial social proof row
6. Dark product/value section with stacked cards and CTA
7. FAQ/help content
8. Final conversion CTA

## Implemented mapping in Logo Fountain

### Reusable components created

- `HeroCenter`
- `ProofStatsRow`
- `LogoWall`
- `SegmentCards`
- `TestimonialCardsRow`
- `DarkFeatureSection`
- `FAQ`
- `FinalCTA`

Location: `apps/web/src/components/marketing/sections.tsx`

### `/` (homepage) sequence

1. `HeroCenter`
2. `ProofStatsRow` (on light gray background)
3. `LogoWall`
4. `SegmentCards` (on light gray background)
5. `TestimonialCardsRow`
6. `DarkFeatureSection` (black section, translucent secondary CTA, white-border cards)
7. `FAQ`
8. `FinalCTA`

### `/work` sequence

1. `HeroCenter`
2. `ProofStatsRow` (on light gray background)
3. `LogoWall`
4. `SegmentCards` (on light gray background)
5. `TestimonialCardsRow`
6. `DarkFeatureSection`
7. `FAQ`
8. `FinalCTA`

## Color notes

- Accent tokens now mirror reference hues in `apps/web/src/styles/reference-theme.css`:
  - `--reference-accent-purple: rgb(81 80 247)`
  - `--reference-accent-purple-2: rgb(148 148 247)`
  - `--reference-accent-blue: rgb(0 153 255)`
  - Gradient tokens for purple, soft purple wash, and purple→blue accent blend.
- Section tint cadence now follows reference-like flow with low saturation:
  - Hero: soft purple radial tint over white.
  - Proof row: white.
  - Logo wall: light gray.
  - Segments: white.
  - Testimonials: white.
  - Dark feature: black base with gradient eyebrow badge + gradient primary CTA.
  - FAQ: white.
  - Final CTA: subtle purple/blue gradient background.
- Accent usage updates in marketing sections include:
  - Gradient hero overline badge.
  - Testimonial byline name highlight using purple gradient text.
  - Stat card underline lines using purple gradient.
  - Blue accent used sparingly on segment icons (reference link-blue cue).

## Style constraints applied

- Alternating white / light-gray sections with a black feature section.
- CTA buttons use 20px radius.
  - Light sections: black filled primary, white outlined secondary.
  - Dark sections: white filled primary, translucent outlined secondary.
- Card styling:
  - Light sections: `1px` black border.
  - Dark section: subtle white border (`white/25`).
- Typography:
  - Fraunces for headings.
  - Inter for body copy.
  - Centered headline blocks with constrained max widths.
