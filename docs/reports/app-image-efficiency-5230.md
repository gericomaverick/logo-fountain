# App image efficiency follow-up

## Summary
- Continued `workbench/consolidated-integration-5230` from `613352adaca81511fa48611d40bcfe6b88f78058`, after delivery of the consolidated report.
- Converted header logo to `next/image`; retained rendered heights and used actual SVG aspect for header/auth logos.
- Tightened auth artwork responsive sizing and removed unconditional preloads, particularly for artwork hidden on mobile.
- Left private signed previews, image optimizer configuration, marketing and all security/lifecycle guards unchanged.
- Passed 5 focused tests, typecheck, lint (zero warnings/errors), and webpack build (31 pages); no broad browser/full-unit rerun.
- Expected resource-selection/preload benefits are qualitative; no browser performance, bandwidth, LCP or cost measurements were made.
- Dependency findings still need separate triage; no dependency updates, live operations, main integration or deployment.

## Changes and inspection
`header-nav.tsx` was the only remaining lint-warning image: a local `/img/logo.svg`. It now uses capitalized `Image` from `next/image`, `width={410}` / `height={386}` matching the SVG's intrinsic dimensions/viewBox, and the original `h-5 w-auto` (20px height; about 21.24px wide at the default root size). The same SVG in `auth-shell.tsx` had an incorrect 156:36 intrinsic ratio; it now declares 410:386 while retaining `h-9 w-auto` (36px height; about 38.24px wide). These attributes describe aspect, not a new large displayed size. Explicit `unoptimized` serves the local SVG directly: no rasterization, variant generation or optimizer cache entries. No unnecessary responsive `sizes` is attached to these fixed-height vector marks. Neither small logo is assigned priority/preload.

AuthShell already used next/image for local auth illustration assets. The existing half-column is inside a `max-w-6xl` (1152px) shell, with 24px viewport gutters at desktop widths. `sizes` now reads `(min-width: 1200px) 576px, (min-width: 1024px) calc(50vw - 24px), 0px`, a border-tolerant upper bound of the rendered column, instead of unbounded 50vw / 48vw and mobile 100vw. The CSS stays unchanged (`object-cover`, hidden below lg); default lazy loading replaces unconditional priority so the desktop-only illustration is not explicitly preloaded on mobile. Desktop-visible artwork remains eligible for loading near the viewport; actual desktop LCP impact is not measured, and no mobile zero-download guarantee is made. A future measured LCP requirement could justify a media-scoped preload, not an unconditional hidden-image preload.

Inspected all other app `<img>` sites: client concept grid, selected concept/version thumbnails, project latest concept, admin concepts grid and two admin project preview locations (seven usages total). Their images come from one-hour Supabase signed concept URLs (`src/lib/supabase/storage.ts`, snapshot/concept handlers). They remain native direct images with existing layout/behavior: optimizing expiring bearer URLs would create token-specific optimizer/cache churn, require remote allowlisting and potentially broaden private asset caching. No such change is justified by this task. Existing auth-shell local raster optimization is retained. `next.config.ts` has no custom image remotePatterns/domains, no global unoptimized setting, and no image-specific cache overrides; it is unchanged. No lowercase `<image>` substitutions, provider transformations or marketing edits.

## Validation
Existing shared node_modules was temporarily symlinked, then removed; no installs or package changes. Validation executed sequentially directly because the documented workbench `scripts/test-queue.mjs` still fails `MODULE_NOT_FOUND`; no queued-job claim.
- `npm run test -- src/components/header-nav.test.ts src/components/auth-shell.test.ts`: **2 files / 5 tests passed**. Rendered markup tests cover intrinsic logo aspect, existing sizing classes, direct SVG URL/no optimizer or preload, desktop artwork sizing and no unconditional preload. The three original invoice-nav tests remain.
- `npm run typecheck`: passed.
- `npm run lint`: **0 errors / 0 warnings**. An initial new test used children as a createElement prop and failed lint; corrected before the final passing checks.
- `npm run build -- --webpack`: passed, **31 generated pages**, with placeholder database/Supabase/Stripe/Postmark/site/admin values only. Included because header now imports next/image and changes client bundling.
- `git diff --check`: passed. No full unit or Playwright rerun: no navigation/form/backend flow change, and no visual/performance/browser assertions are claimed.

No measured transfer-byte, LCP or cost reductions. Expected benefits: correct initial aspect reservation, less oversized raster candidate selection on wide desktop screens, fewer unconditional preloads competing with useful resources, and removal of the last lint warning. The header SVG itself is not compressed or reduced in byte size by this change; introducing next/image also has a client-bundle tradeoff, not a measured net win.

## Safety / separate dependency triage
Original emergency ref remains `bfaac3293f84a3259c730e0e3e23aaba6e87ea6e`; the primary dirty workspace was not edited. Package-lock SHA-256 remains `851a41e2a8a63a62148de0acf3d299336e26b943e954d4c86d12e187ec2ba231`. No dependency update, audit fix, signed-image optimizer allowlist, migration, live-service operation, main merge/push or deployment.

Prior audit report: `docs/reports/consolidated-integration-5230.md` (also `/home/openclaw/.openclaw/workspace/projects/workbench/data/logo-fountain/reports/consolidated-integration-5230.md`). Full audit JSON: `/home/openclaw/.openclaw/workspace/projects/workbench/data/logo-fountain/reports/consolidated-integration-5230-artifacts/consolidated-5230-audit.json`. That read-only audit found **39 affected packages: 3 critical / 26 high / 8 moderate / 2 low**. Separate supported-version/reachability triage remains necessary; this image-only follow-up neither fixes nor re-audits them.

Full follow-up logs are retained beside the external report in `app-image-efficiency-5230-artifacts/`.
