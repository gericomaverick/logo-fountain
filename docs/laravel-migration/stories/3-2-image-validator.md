# Story 3.2: Image validator

**Status:** done (2026-11-22, merged to main; created from `origin/main` df9e574) · **DoD variant:** Laravel-only · **Epic:** 3 · **Covers:** X-12 (images) · **Gate:** `@uploads&@unit` · **After:** 0.6a (done) · **Stacks on:** `main`. **Runs SERIAL with 3.3: one builder, one branch, 3.2 first then 3.3.** 3.2 creates the four shared files below once; 3.3 reuses them.

> Created with BMAD `create-story` (docs only). Sources: `brownfield/storage-and-uploads.md` §5 and §7, `epics.md:280-282`, inventory X-12 (`01-feature-inventory.md:143`), ledger #108, the golden corpus (`tests/parity/fixtures/uploads/manifest.json`, 267 cases), Next files below, all `file:line` checked on 2026-11-22.

## Story
As the portal, I need a PHP port of the concept-image validator, so that every upload is judged exactly as Next judged it, with no decoding library and no bytes read before the size check.

## Acceptance criteria
1. **Corpus parity.** For every `kind: "image"` case in the manifest (**138 images**: 2 `FILE_REQUIRED`, 2 `FILE_TOO_LARGE`, 10 `INVALID_FILE_TYPE`, 7 `FILE_SIGNATURE_MISMATCH`, 7 `IMAGE_DIMENSIONS_TOO_LARGE`, 85 `MALFORMED_IMAGE`, 25 accepted, counted 2026-11-22 from the manifest; recount when you start) the validator returns the same `code` (or accepts) with `filename` and `mime` from the case. No `laravelExpectedCode` exists for images (DV-13 is ZIP only). Also asserts the `branch` message where the manifest records one.
2. **Size first.** Size 0 → `FILE_REQUIRED` "Concept image is empty"; over **10 MiB (10,485,760)** → `FILE_TOO_LARGE` "Concept image exceeds the 10 MB limit"; checked from the declared size **before any byte is read** (`upload-validation.ts:34-39`; test `:125-133`): test with a file object whose `getSize()` reports 10 MiB + 1 and whose path is unreadable (a read attempt would fail differently). `image-10mib-plus-1-wrong-type` gives `FILE_TOO_LARGE`, not `INVALID_FILE_TYPE`.
3. **Type.** Extension = text after the last dot, lowercased (`:29-32`); `png|jpg|jpeg|webp` **and** the **client-supplied** MIME equal `image/png|image/jpeg|image/webp`; otherwise `INVALID_FILE_TYPE` "Use a PNG, JPEG, or WebP image with matching file extension and MIME type" (`:170-181`). `jpeg` is stored as `jpg`. SVG and GIF are rejected even when they claim an image MIME (`upload-validation.test.ts:111-119`).
4. **Structure** (a byte-for-byte port, no GD/Imagick/`getimagesize`): PNG `:62-96`, JPEG `:98-134`, WebP `:136-168`, dimensions `:53-60` (> **40,000,000** pixels → `IMAGE_DIMENSIONS_TOO_LARGE`; exactly 40 MP accepted: `png-40mp-exact`, `jpeg-40mp-exact`). Rules as listed in `storage-and-uploads.md` §5.3 (PNG CRC on every chunk, no APNG, IEND last with nothing after; JPEG one SOF0/1/2, EOI at end of file; WebP RIFF size = file length, exactly one payload, no animation).
5. **Result.** `PreparedUpload` (`path`, canonical `extension`, canonical `contentType`, `size`) or an `UploadValidationException` with Next's `errorCode` and message.
6. **Ported unit cases.** The tests in the `concept image validation` describe of `upload-validation.test.ts` (`:87-133`). Ledger #108 counts 12 tests for the file; the `final ZIP validation` describe (`:134-158`) is 3.3's.

## Inventory scope
- **X-12** (images half): Laravel/Tests columns; row stays open until 3.3 and the HTTP gates (7.5a `@uploads&@api`). Ledger **#108** shared with 3.3 (this story: the image tests; 3.3: the ZIP tests); mark the row "in progress: images" here.
- Not in scope: the route, multipart parsing, PHP `upload_max_filesize`/`post_max_size` (7.5a; see open question 4), storage (3.1).

## Next.js source read
- `apps/web/src/lib/upload-validation.ts` (195 lines): constants `:4-9`; error class `:18-23`; `requireSize` `:34-39`; readers `:41-51`; `assertDimensions` `:53-60`; `validatePng` `:62-96`; `validateJpeg` `:98-134`; `validateWebp` `:136-168`; `prepareConceptImage` `:170-184`.
- `upload-validation.test.ts` (166): image tests up to `:133`. `lib/__tests__/golden-upload-corpus.test.ts:55-69` (how Next runs the corpus). `tests/parity/fixtures/uploads/generate.mjs`.
- Docs: `brownfield/storage-and-uploads.md` §5, §7; ledger `:116`.

## Behaviour notes
- Order: size → extension+MIME → read bytes → structural validate. The MIME is the browser's, never sniffed: in Laravel use `getClientMimeType()`, **not** `getMimeType()` (which sniffs and would pass a spoofed pair).
- Every failure is a thrown typed error with one code and one message; first failure wins, so port the check **order** inside each format.
- The corpus pairs each case with the Next message in `branch`; use it to prove a case reaches the intended branch, not just the same code.
- The 3 `generated` image cases (size-only) aren't committed (`manifest.json` description); see open question 2.

## Laravel guidance
- `app/Support/Uploads/ConceptImageValidator.php` (`prepare(string $path, string $clientName, ?string $clientMime, int $declaredSize): PreparedUpload`, so a controller passes `$file->getRealPath()`, `getClientOriginalName()`, `getClientMimeType()`, `getSize()`); format validators as private methods or small classes `PngValidator`, `JpegValidator`, `WebpValidator` in `app/Support/Uploads/Image/`. `unpack('N'/'V'/'n'/'v')` for integers; CRC with `hash('crc32b')`/`crc32()` (check endianness against `png-bad-crc`). Images are ≤ 10 MiB, so reading the file into one string is fine.
- Mind 64-bit: width × height can exceed 2^63 for 32-bit dimensions; compare with the 40 MP limit by division (`$w > intdiv(40_000_000, max($h, 1))`), and cover `png-huge-dimensions` and `jpeg-max-dimensions`.

### Shared files (created here, once; 3.3 reuses them)
Both stories need the same four small files. **3.2 creates them**; 3.3 runs after 3.2 on the same branch and only reads or extends them (additions it needs go in as a normal edit in 3.3's commit).
- `app/Support/Uploads/UploadValidationException.php`: `final class … extends \RuntimeException`, readonly public `string $errorCode` (one of `FILE_REQUIRED`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `FILE_SIGNATURE_MISMATCH`, `MALFORMED_IMAGE`, `IMAGE_DIMENSIONS_TOO_LARGE`, `MALFORMED_ZIP`, `ZIP_LIMIT_EXCEEDED`), message = Next's message. Mirrors `UploadValidationError` (`upload-validation.ts:18-23`).
- `app/Support/Uploads/PreparedUpload.php`: readonly `string $path` (validated temp file), `string $extension`, `string $contentType`, `int $size`. (Path, not a byte string: a 95 MB ZIP must not sit in memory twice; see open question 3 in 3.3.)
- `tests/Support/UploadCorpus.php`: reads `manifest.json` from `config('parity.fixtures')`-style mounted dir `/var/www/parity-fixtures/uploads`, yields cases by `kind`, resolves the expected code (`laravelExpectedCode` when present, else `expectedCode`), and builds the `generated` cases that aren't committed.
- `compose.yaml`: one added mount line `../../tests/parity/fixtures/uploads:/var/www/parity-fixtures/uploads:ro` next to the `rules`/`scenarios`/`seed-facts` mounts (`apps/portal/compose.yaml:17-20`), the same line in both stories.

## Tasks
1. Create the four shared files (3.3 reuses them).
2. `ConceptImageValidator` size/type/prepare (AC 2, 3, 5).
3. PNG, JPEG, WebP validators (AC 4), ordered as Next; run the corpus after each format.
4. `tests/Unit/Support/Uploads/ConceptImageValidatorTest.php` (the ported unit cases) and `ConceptImageCorpusTest.php` (AC 1, dataset from `UploadCorpus`).
5. `bin/test`; Conversion record; inventory X-12, ledger #108 (images), `sprint-status` → review.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 `@uploads @unit` | `ConceptImageCorpusTest.php`: one dataset row per image case (138), code + `branch` message | AC 1, X-12 |
| L1 `@uploads @unit` | `ConceptImageValidatorTest.php`: ported Next cases; size-before-read (unreadable path); client MIME not sniffed (PNG bytes named `.png` with MIME `image/jpeg` → `INVALID_FILE_TYPE`); `jpeg` → `jpg`; 40 MP boundary | AC 2–5, #108 |
| Arch | none new (the no-image-library rule is added in 3.3's arch file for ZIP only; open question 3) | |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review` and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. No parity (L4/L5) run: the HTTP subset is gated in the story named under *Dependencies*.

## Dependencies and follow-ups
- Consumer: 7.5a (concept upload route, `@uploads&@api` image subset). The ZIP twin is 3.3. Memory/ini limits for the route: 7.5a.

## Open questions (with recommendations)
1. **Shared files (decided: serial).** The owner decided 3.2 then 3.3 run serially on one branch with one builder; 3.2 creates the exception, `PreparedUpload`, `UploadCorpus` and the compose mount once. No byte-identical duplication.
2. **Generated corpus cases** (`image-exactly-10mib`, `-plus-1`, `-plus-1-wrong-type`, built by `generate.mjs`, node). The portal image has no node step for tests. *Recommendation:* build those three in `UploadCorpus` in PHP (sparse temp file with `ftruncate`, name/MIME from the manifest, assert the manifest `size`/`sha256` where cheap); don't require node.
3. **Image-library arch guard.** The epic has an arch test only for ZIP (`ZipArchive`). *Recommendation:* also forbid `imagecreatefrom*`, `getimagesize`, `Imagick` in `app/Support/Uploads` here (one extra test line; same reason: a decoder accepts files this validator rejects). Optional; owner may drop it.
4. **PHP ini limits.** Default `upload_max_filesize`/`post_max_size` would reject 10 MiB+ before the validator. Not this story; flagged for 7.5a (needs the portal `php.ini`).
5. **Owner items: none.**

## Doc / code disagreements and citation fixes
- `storage-and-uploads.md` §5 says the error response is `400 {error:{message, code}}`; that is the route's (7.5a), not the validator's.

## Conversion record

> Fill at implementation, from `templates/story-conversion-record.md`. Write *Behaviour notes* before converting.

### Inventory scope
X-12 (images): Laravel/Tests columns, row stays open (ZIP in 3.3, HTTP in 7.5a). Ledger #108 (images).

### Next.js source read
`apps/web/src/lib/upload-validation.ts`, `upload-validation.test.ts`, `lib/__tests__/golden-upload-corpus.test.ts`, `tests/parity/fixtures/uploads/manifest.json`; `brownfield/storage-and-uploads.md` §5, §7.

### Behaviour notes
Order: size (declared, before any read) → extension + client MIME → read → structure; first failure wins inside each format. Byte reads past the end are `null` (an out-of-range `Uint8Array` index is `undefined`), so the JPEG scan and marker checks agree. 40 MP compare is `w*h > 40,000,000` (PHP int overflow goes to float; covered by a 4,294,967,295² case).

### Laravel implementation
- `app/Support/Uploads/`: `UploadValidationException` (`errorCode`), `PreparedUpload` (path), `ConceptImageValidator::prepare()`, `Image/{Bytes,PngValidator,JpegValidator,WebpValidator}.php`.
- `tests/Support/UploadCorpus.php` (manifest reader, builds the 3 generated images in PHP, sha256-checked), `compose.yaml` mount line.
- Tests: `tests/Unit/Support/Uploads/{ConceptImageValidatorTest,ConceptImageCorpusTest}.php`, `tests/Arch/UploadsTest.php`.

### Deviations from Next.js
None. (DV-13 is ZIP only.)

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 `@uploads @unit` | `ConceptImageCorpusTest` (138 cases: code + branch message) | X-12 |
| L1 `@uploads @unit` | `ConceptImageValidatorTest` (ported Next cases, size-before-read, client MIME, 40 MP) | X-12 |
| Arch | `UploadsTest` (no image decoder) | X-12 |

Test-port ledger rows resolved: #108 images half (row stays open for 3.3).

### Test evidence
`bin/test` (stack lf-wb11): Pint, Larastan 9, Pest 1450 passed (4063 assertions), 0 failed, 0 skipped. Story subset: `pest tests/Unit/Support/Uploads` 150 passed.

**Not run, and why:** parity L4/L5 (no route until 7.5a); the Next side (no apps/web change).

### Decided / Open
Q2 (generated cases built in PHP) and Q3 (image-decoder arch guard) built as recommended, **decided (owner)**. Q4 (php.ini limits) is 7.5a's.

### Gotchas
None promoted to AGENTS.md (no new pattern).

### Docs updated
Inventory X-12 · ledger #108 · sprint-status → review · DECISIONS/RISKS/ASSUMPTIONS one line each.

### Open items
php.ini upload limits → 7.5a.
