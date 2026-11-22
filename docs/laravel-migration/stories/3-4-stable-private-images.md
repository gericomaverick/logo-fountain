# Story 3.4: Stable private images

**Status:** ready-for-dev (2026-11-22, created from `origin/main` df9e574) · **DoD variant:** Laravel-only · **Epic:** 3 · **Covers:** DV-12, ADR-021 · **Gate:** `@unit` · **After:** 1.8c (done, on `main`), 3.1 (**not on `main` yet**) · **Stacks on:** `main` once 3.1 is merged; until then on `workbench/epic-3-stories`' 3.1 branch.

> Created with BMAD `create-story` (docs only). Sources: ADR-021, `epics.md:288-292`, inventory DV-12 (`01-feature-inventory.md:182`), `stories/1-8c-…md:44, 122`, the code on `main`.

## What already exists on `main` (1.8c is done)
- The **client half of DV-12 is built and tested**: `resources/js/Components/ui/PrivateImage.tsx` and `lib/media.ts:140-175` (`SignedImage = {imageKey, url, expiresAt?}`, `IMAGE_REFRESH_MARGIN_MS = 5 min`, `signedUrlExpiry()` from `X-Amz-Date`+`X-Amz-Expires`, `stableImage()`); tests `tests/js/media.test.ts:102-130` (same key keeps `src`; new key swaps; ≤ 5 min swaps; expiry read from the URL); `ConceptCard.tsx:41` and `ConceptViewer.tsx:68` use it; the 1.8c browser spec covers "stable `src` after re-sign" (`1-8c…md:91`).
- **Not on `main`:** any server-side `imageKey`. There is no snapshot or concept payload in Laravel yet (Epics 5–7), no `sign()` (3.1), and Next has no `imageKey` at all (grep of `apps/web/src`: none); Next signs in `lib/project-snapshot.ts:205-220` (`signConceptPreview`, returns `null` on any failure) via `createSignedConceptAssetUrl` (`r2.ts:131`). DV-12 is an **added field**, backwards compatible (`01-feature-inventory.md:182`).
- So this story is the **server-side presenter plus the contract** between PHP and the 1.8c component.

## Story
As the portal, I need one server helper that turns a stored image asset into `{imageKey, url, expiresAt}`, so that every payload gives the UI a key that is stable for the same bytes and a fresh URL the UI only adopts when needed.

## Acceptance criteria
1. **imageKey stable.** **Given** an unchanged asset, **then** two calls (and two polls, with different signatures) return the **same** `imageKey`; a new object path (a new version, a replaced file) gives a different key. The key is derived from stored data only (never from the URL or time) and does not reveal the bucket or object path. See open question 1.
2. **Rendered src unchanged.** **Given** an unchanged `imageKey`, **then** the rendered `src` is unchanged: a vitest case feeds two real presigned URLs for one key (produced by 3.1's `sign()`, captured as a fixture string) through `stableImage` and gets the first back.
3. **Refresh near expiry.** **Given** a URL within 5 minutes of expiry, **then** it refreshes (component/unit test, as `media.test.ts:114`), with `expiresAt` as sent by the server **in epoch milliseconds**, equal to the URL's `X-Amz-Date + X-Amz-Expires` (a PHP test asserts equality, a vitest case asserts `signedUrlExpiry(url) === expiresAt`).
4. **Never throws.** No asset, or any signing failure (storage unreachable, unconfigured) → `null` (the UI shows "Preview unavailable"), as `project-snapshot.ts:205-220`; the failure is logged **without** the URL.
5. **Shape.** Exactly `{imageKey: string, url: string, expiresAt: int}` (matching `SignedImage`, `media.ts:141`); URL TTL 3600 s for concepts (`r2.ts:131`).
6. **Not persisted or logged** (X-11): nothing stores the URL; a test asserts the helper writes no DB row and the Scrubber redacts it (3.1's case).

## Inventory scope
- **DV-12** (`01-feature-inventory.md:182`; touches C-03, C-08, C-09, D-02, D-05): Laravel/Tests columns, **row stays open** until the payloads exist (snapshot 5.x/6.x, concept payloads 7.x, `@api` and `@visual` there). ADR-021 implemented in part: the server helper here, the component in 1.8c.
- Not in scope: building any payload or route; the `<PrivateImage>` component (done); polling.

## Next.js source read
- `apps/web/src/lib/project-snapshot.ts:205-220` (`signConceptPreview`); `lib/storage/r2.ts:62-68, 131-132`. `grep imageKey apps/web/src`: no hits (verified).
- Portal: `resources/js/lib/media.ts:140-175`, `PrivateImage.tsx`, `tests/js/media.test.ts:102-130`; `app/Models/FileAsset.php` (`bucket`, `path`, kind).
- Docs: ADR-021; `1-8c…md:44, 122`; DV-12 row.

## Behaviour notes
- Next re-signs on every poll, so the URL differs each time (new `X-Amz-Date`/signature) and the image re-downloads and flickers: the defect DV-12 fixes. The fix needs a key that doesn't change when the bytes don't.
- Object paths are random and immutable (a new `{uuid}` per upload, `storage-and-uploads.md:19-20`); replaced or new-version concepts get a new path. So a value derived from the asset identity is stable exactly while the bytes are.
- The UI compares `imageKey` strings only; `expiresAt` is optional (the UI can read the URL), but sending it removes the guess.

## Laravel guidance
- `app/Support/Storage/SignedImage.php`: `static for(?FileAsset $asset, ?PrivateStorage $storage = null): ?array`; calls 3.1's `sign('concepts', $asset->path, 3600)`; `expiresAt` = `now()` (ms) + ttl×1000, or parse the URL. Wrap in `try/catch (Throwable)` → log a scrubbed message → `null`.
- Payload builders (later stories) call it; they don't add `imageKey` themselves.

## Tasks
1. `SignedImage` helper (AC 1, 4, 5); key derivation per open question 1.
2. PHP tests: `tests/Unit/Support/Storage/SignedImageTest.php` (key stable across calls/times, differs per path; shape; null on failure with a failing storage double; expiresAt equals the URL's; no DB write).
3. Vitest contract case: `tests/js/signed-image-contract.test.ts` with a presigned-URL fixture (AC 2, 3). New file, so 1.8c's `media.test.ts` is untouched.
4. `bin/test` plus the JS test command the 1.8c record names (`1-8c…md` Test evidence); Conversion record; inventory DV-12, `sprint-status` → review.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 `@unit` | `SignedImageTest.php` as above | AC 1, 3–6 |
| L1 `@unit` (vitest) | `tests/js/signed-image-contract.test.ts`: same key → same `src`; ≤ 5 min → refresh; `expiresAt` matches the URL | AC 2, 3 |
| Existing, re-run only | `tests/js/media.test.ts` (1.8c) | regression |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review` and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. No parity (L4/L5) run: the HTTP subset is gated in the story named under *Dependencies*.


## Dependencies and follow-ups
- Needs 3.1 merged (`sign()`). Consumers: snapshot/concept payload stories (Epics 5–7) must use `SignedImage::for`; their `@api` contract tests assert the `imageKey` field. DV-12 closes there.

## Open questions (with recommendations)
1. **What is the `imageKey`?** Options: the `FileAsset` id; or a hash of `bucket/path`. *Recommendation:* the `FileAsset` id if it is an opaque uuid (check the model/migration when you start), else `hash('sha256', bucket|path)` first 32 hex. Never the raw path. (ADR-021 doesn't say; the epic doesn't either.)
2. **Component test vs vitest.** The epic says "component test"; the component and its tests already exist (1.8c). *Recommendation:* add only the contract file in task 3; don't re-test the component.
3. **Stack.** 3.1 isn't on `main`. *Recommendation:* start only after 3.1 merges (or stack on its branch); if neither, write the helper against a `PrivateStorage` interface double and finish when 3.1 lands.
4. **ADR check.** ADR-021 says the key is on "snapshot and concept payloads"; nothing is changed. Owner items: none.

## Doc / code disagreements and citation fixes
- `epics.md:288-292` "After: 1.8c": satisfied, but its `stableImage` is TypeScript only; the server part didn't exist, hence this story's scope.

## Conversion record

> Fill at implementation, from `templates/story-conversion-record.md`. Write *Behaviour notes* before converting.

### Inventory scope
DV-12: Laravel/Tests columns; row stays open until payload stories use the helper. ADR-021.

### Next.js source read
`apps/web/src/lib/project-snapshot.ts:205-220`, `lib/storage/r2.ts:62-68,131`; portal `resources/js/lib/media.ts`, `PrivateImage.tsx`, `tests/js/media.test.ts`; ADR-021.

### Behaviour notes
_(fill)_

### Laravel implementation
_(files created or changed, and where each behaviour lives)_

### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|

Test-port ledger rows resolved: _(fill)_

### Test evidence
_(commands, with passed / failed / skipped counts)_

**Not run, and why:** _(fill)_

### Gotchas
_(mark the ones promoted to `apps/portal/AGENTS.md`)_

### Docs updated
_(inventory · sprint-status · ledger · handoff · ADRs · DECISIONS/RISKS/ASSUMPTIONS)_

### Open items
_(follow-ups with an owner and a story)_
