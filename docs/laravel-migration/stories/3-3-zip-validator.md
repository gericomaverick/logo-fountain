# Story 3.3: ZIP validator

**Status:** ready-for-dev (2026-11-22, created from `origin/main` df9e574) · **DoD variant:** Laravel-only · **Epic:** 3 · **Covers:** X-12 (ZIP), DV-13 · **Gate:** `@uploads&@unit` · **After:** 0.6a (done), **3.2** · **Stacks on:** 3.2 (same branch, one builder, serial: 3.2 then 3.3). The four shared files are created by 3.2; this story reuses them. This story's own files: `app/Support/Uploads/FinalZipValidator.php`, `app/Support/Uploads/Zip/*`, `tests/Unit/Support/Uploads/FinalZip*Test.php`, `tests/Arch/ZipValidatorTest.php`.

> Created with BMAD `create-story` (docs only). Sources: `brownfield/storage-and-uploads.md` §6–7, `epics.md:284-286`, inventory X-12 (`01-feature-inventory.md:143`) and DV-13 (`:183`), ledger #108/#110, the golden corpus (`manifest.json`, 129 ZIP cases), Next files below; `file:line` checked on 2026-11-22.

## Story
As the portal, I need a PHP port of the final-ZIP validator at the new 95 MB cap, so that every ZIP is judged as Next judged it (except size, DV-13) and a malicious archive can't reach storage or a client.

## Acceptance criteria
1. **Corpus parity.** Every `kind: "zip"` manifest case (**129**: 90 `MALFORMED_ZIP`, 6 `ZIP_LIMIT_EXCEEDED`, 6 `INVALID_FILE_TYPE`, 5 `FILE_SIGNATURE_MISMATCH`, 1 `FILE_REQUIRED`, **3 `FILE_TOO_LARGE`, 18 accepted** as Laravel-expected (Next's own counts are 1 and 20; `zip-95000001` and `zip-100mib-exact` flip to `FILE_TOO_LARGE` under DV-13); counted 2026-11-22, recount when you start) returns the **Laravel-expected** code: `laravelExpectedCode` when present, else `expectedCode`. Also asserts `branch` messages where recorded.
2. **DV-13 cap.** Size 0 → `FILE_REQUIRED`; over **95,000,000 bytes** → `FILE_TOO_LARGE` with the new figure in the message ("Final ZIP exceeds the 95 MB limit"). Exactly 95,000,000 is accepted (`zip-95000000`); **95,000,001 → `FILE_TOO_LARGE`** (`zip-95000001`: Next accepts, Laravel rejects) and `zip-100mib-exact` (104,857,600) → `FILE_TOO_LARGE` (Next accepts); `zip-100mib-plus-1` is `FILE_TOO_LARGE` on both. 0.8e confirmed Next accepts 95,000,001 (`storage-and-uploads.md:57`). Size is decided from the declared size **before reading** (`upload-validation.ts:34-39`, test `:154-163`).
3. **Type.** Extension `zip` **and** client MIME `application/zip` or `application/x-zip-compressed`, else `INVALID_FILE_TYPE` "Use a .zip file with an allowed ZIP MIME type" (`:186-189`); first 4 bytes `PK\x03\x04` (read as little-endian u32 `0x04034b50`) or `FILE_SIGNATURE_MISMATCH` "File is not a standard ZIP archive" (`:190`). Stored type is canonical `application/zip`, extension `zip` (`:191`; test `:135-141`).
4. **Structure** (a byte-for-byte port of `validateZip`, `zip-validation.ts:30-131`): EOCD within the last 65,557 bytes with the comment ending exactly at EOF (`:36-38`); single volume, non-zero count (`:41`); count ≤ **1000** else `ZIP_LIMIT_EXCEEDED` (`:42`); central directory ends at the EOCD (`:43`); per-entry rules in `storage-and-uploads.md` §6.2 (no ZIP64/split/encryption, methods 0/8, flags `0x800|8|6`, UTF-8 strict or CP437, name safety incl. NFKC and Windows-reserved names, case-insensitive collisions, file-as-parent, external attributes, extra-field denylist `0x7075 0x6375 0x0001 0x000d 0x756e`, local = central header, descriptors, contiguous records).
5. **Limits and streaming inflation.** Declared size ≤ **500 MiB** and ≤ max(1, compressed) × **100** (`:91`) else `ZIP_LIMIT_EXCEEDED`; then **actual streaming inflation in 16 KiB chunks** with the same per-entry and **total 500 MiB** limits and the actual size and CRC-32 checked, trailing compressed data rejected (`:109` and around). Uses `inflate_init(ZLIB_ENCODING_RAW)` + incremental `inflate_add`, `hash_init('crc32b')`; **never inflates a whole entry into one string**.
6. **Arch.** `tests/Arch/ZipValidatorTest.php`: no use of `\ZipArchive` (or `zip_open`/`zip_*`) anywhere under `app/` (the `zip` extension is installed in the Dockerfile, `docker-php-ext-install … zip`, so it is reachable and must be forbidden by test).
7. **Result.** `PreparedUpload` (`path`, `zip`, `application/zip`, `size`) or `UploadValidationException` with Next's code/message (DV-13 message figure aside).
8. **Ported unit cases**: the `final ZIP validation` describe of `upload-validation.test.ts` (`:134-158`) and all of `zip-validation.test.ts` (68 lines; ledger #110: 8 tests; its `it`s at `:35, 39, 43, 48, 52, 56, 63` plus the helpers above them).

## Inventory scope
- **X-12** (ZIP half) and **DV-13** (`01-feature-inventory.md:183`): Laravel/Tests columns; X-12 stays open for the HTTP gate (7.8a `@uploads&@api`, `@deviation`). Ledger **#110** resolved here; **#108** ZIP tests resolved here (the image tests are 3.2's).
- Not in scope: route, ini limits, Cloudflare proxy (DV-13's reason), storage, N-09 email.

## Next.js source read
- `apps/web/src/lib/zip-validation.ts` (131 lines): `updateCrc`/`crc32` `:12-16`; `decodeName` `:18`; `safeName` `:22`; `validateZip` `:30-131` (EOCD `:36-38`, count `:41-42`, directory bounds `:43`, ratio `:91`, streaming limit `:109`).
- `lib/upload-validation.ts:6-9` (limits), `:34-39`, `:186-193` (`prepareFinalZip`); tests `upload-validation.test.ts:134-163`, `zip-validation.test.ts` (68). Corpus: `lib/__tests__/golden-upload-corpus.test.ts:55-69`, `tests/parity/fixtures/uploads/{manifest.json,generate.mjs}`.
- Docs: `brownfield/storage-and-uploads.md` §6–7; DV-13; ledger `:118`.

## Behaviour notes
- Every failure is one typed error; the **order** of checks decides the code on files with several faults, so port the check order exactly and run the corpus after each group of rules.
- Next reads the whole file as bytes; the port should read ranges from the file (`fopen`/`fseek`/`fread`) except where Next scans the tail (EOCD window ≤ 65,557 bytes) so a 95 MB upload isn't held in memory (open question 3).
- The deflate bomb cases (`zip-total-expanded-over-500mib`, 8,206,006 bytes) need real inflation to the 500 MiB limit, bounded by the 16 KiB chunk loop; it must stop at the limit, not after.
- CRC-32 in JS is table-based on a signed-shift loop (`:12-16`); PHP `hash('crc32b')` output is big-endian hex: convert with `hexdec`.
- 5 corpus cases are `generated` (not committed): `zip-95000000`, `zip-95000001`, `zip-100mib-exact`, `zip-100mib-plus-1` (size-only) and the 500 MiB bomb. See open question 2.

### Shared files (created by 3.2; reuse, don't recreate)
The four files below already exist from 3.2 (serial, same branch). Use them as they are; if 3.3 needs a change, make it as a normal edit and say so in the Conversion record.
- `app/Support/Uploads/UploadValidationException.php`: `final class … extends \RuntimeException`, readonly public `string $errorCode` (one of `FILE_REQUIRED`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `FILE_SIGNATURE_MISMATCH`, `MALFORMED_IMAGE`, `IMAGE_DIMENSIONS_TOO_LARGE`, `MALFORMED_ZIP`, `ZIP_LIMIT_EXCEEDED`), message = Next's message. Mirrors `UploadValidationError` (`upload-validation.ts:18-23`).
- `app/Support/Uploads/PreparedUpload.php`: readonly `string $path` (validated temp file), `string $extension`, `string $contentType`, `int $size`. (Path, not a byte string: a 95 MB ZIP must not sit in memory twice; see open question 3 in 3.3.)
- `tests/Support/UploadCorpus.php`: reads `manifest.json` from `config('parity.fixtures')`-style mounted dir `/var/www/parity-fixtures/uploads`, yields cases by `kind`, resolves the expected code (`laravelExpectedCode` when present, else `expectedCode`), and builds the `generated` cases that aren't committed.
- `compose.yaml`: one added mount line `../../tests/parity/fixtures/uploads:/var/www/parity-fixtures/uploads:ro` next to the `rules`/`scenarios`/`seed-facts` mounts (`apps/portal/compose.yaml:17-20`), the same line in both stories.

## Tasks
1. Confirm 3.2's four shared files are present; do not recreate.
2. `FinalZipValidator::prepare()`: size/type/signature (AC 2, 3, 7).
3. Structure walk (AC 4), then limits + streaming inflation (AC 5); corpus after each stage.
4. `tests/Arch/ZipValidatorTest.php` (AC 6).
5. Tests per plan; `bin/test`; Conversion record; inventory X-12/DV-13, ledger #108 (ZIP) and #110, `sprint-status` → review.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 `@uploads @unit` | `FinalZipCorpusTest.php`: one dataset row per ZIP case (129) with the Laravel-expected code and `branch` | AC 1, X-12 |
| L1 `@uploads @unit` | `FinalZipValidatorTest.php`: 95,000,000 ok / 95,000,001 and 104,857,600 `FILE_TOO_LARGE` (DV-13); size before read; MIME aliases and canonical output; ported `zip-validation.test.ts` cases | AC 2, 3, 8, #108/#110, DV-13 |
| L1 `@uploads @unit` | `FinalZipStreamingTest.php`: a bomb stops at the 500 MiB limit with bounded memory (`memory_get_peak_usage` delta < 64 MiB) | AC 5 |
| Arch | `tests/Arch/ZipValidatorTest.php` | AC 6 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review` and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. No parity (L4/L5) run: the HTTP subset is gated in the story named under *Dependencies*.


## Dependencies and follow-ups
- Consumer: 7.8a (final upload and replace; `@uploads&@api`, `@deviation` DV-13, "95,000,001 bytes is rejected", `epics.md:469-471`). 3.1 stores what this validates. Also owner-visible: the portal's PHP `upload_max_filesize`/`post_max_size` and the nginx body limit must allow ≥ 95,000,001 bytes through, or the HTTP response won't be `FILE_TOO_LARGE` (7.8a).

## Open questions (with recommendations)
1. **Shared files (decided: serial).** The owner decided 3.3 runs after 3.2 on the same branch; 3.2 creates the shared files.
2. **Generated cases in Laravel.** Five cases aren't committed (`generate.mjs`, node). *Recommendation:* build them in `UploadCorpus` in PHP (sparse files for the four size cases; a streamed raw-deflate bomb for the 500 MiB case, written to a temp file), asserting the manifest `size` where it is recorded.
3. **Bytes vs file path.** Next holds 95 MB in memory; PHP's default `memory_limit` (128M) would be tight with copies. *Recommendation:* the validator reads ranges from the file path (the structure walk needs only EOCD, the central directory and local headers; payload goes through the streaming inflater). Same output, different memory profile; no parity impact.
4. **Epic vs Next: the ratio check on declared vs actual.** Epic says only "same code"; Next applies the ratio to declared (`:91`) and actual (`:109`) sizes. *Recommendation:* port both; the corpus decides.
5. **Message figure for DV-13.** `storage-and-uploads.md:44` gives the code only; Next's message divides by MiB (`:38`) and would print 95.37 for 95,000,000. *Recommendation:* the message says "95 MB" (decimal; matches `apps/portal/resources/js/lib/media.ts` which the 1.8c client already uses: "95,000,000 bytes (DV-13)", `tests/js/media.test.ts:41`); the code is what's tested.
6. **Owner items: none.** (DV-13 is already owner-approved.)

## Doc / code disagreements and citation fixes
- `storage-and-uploads.md:44` says "Over 100 MiB … Laravel 95,000,000": consistent with DV-13; `manifest.json` records both codes.

## Conversion record

> Fill at implementation, from `templates/story-conversion-record.md`. Write *Behaviour notes* before converting.

### Inventory scope
X-12 (ZIP), DV-13: Laravel/Tests columns; X-12 stays open for 7.8a. Ledger #108 (ZIP), #110.

### Next.js source read
`apps/web/src/lib/zip-validation.ts`, `upload-validation.ts:186-193`, `zip-validation.test.ts`, `upload-validation.test.ts:134-163`, `golden-upload-corpus.test.ts`, `manifest.json`; `brownfield/storage-and-uploads.md` §6–7; DV-13.

### Behaviour notes
Check order of `validateZip` is kept: first failing rule decides MALFORMED_ZIP vs ZIP_LIMIT_EXCEEDED. Size is judged from the declared size before any read (0 -> FILE_REQUIRED, >95,000,000 -> FILE_TOO_LARGE, DV-13), then extension + client MIME, then `PK\x03\x04`, then structure. Names: cp437 unless flag 0x800, NFKC-canonical, no control/`\`/`:`, no reserved/trailing dot-space components, case-insensitive collisions. Payloads are inflated in 16 KiB chunks with running size, ratio and 500 MiB total checks, plus CRC.

### Laravel implementation
`app/Support/Uploads/FinalZipValidator.php` (entry, mirrors `prepareFinalZip`), `Zip/ZipStructure.php` (port of `validateZip`), `Zip/ZipFile.php` (ranged fseek/fread; nothing whole in memory). Inflation via `inflate_init/inflate_add` (raw), CRC via `hash('crc32b')`. No ZipArchive (arch test).

### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Final ZIP cap | 100 MiB | 95,000,000 bytes, message "Final ZIP exceeds the 95 MB limit" | Cloudflare cap | DV-13 |
| Out-of-range read | RangeError | MALFORMED_ZIP | no corpus case; safe default | none |
| Corpus bomb bytes | fixed-Huffman stream | zlib-deflated equivalent, built in PHP | no node in the test stack | built as recommended |

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| Unit + corpus | `tests/Unit/Support/Uploads/FinalZipCorpusTest.php` (129 zip cases, +1 count) | X-12 |
| Unit | `FinalZipValidatorTest.php`, `FinalZipStreamingTest.php` (bounded memory) | X-12 |
| Arch | `tests/Arch/ZipValidatorTest.php` | X-12 |

Test-port ledger rows resolved: #108 (ZIP half), #110.

### Test evidence
`bin/test`: Pint, Larastan, Pest 1590 passed / 4409 assertions, 0 failed, 0 skipped. Corpus file: 130 passed.

**Not run, and why:** HTTP upload path (7.5a); generated 95,000,001 / 100 MiB cases are sparse files (rejected on declared size), not byte-identical to Next's.

### Gotchas
`inflate_add` warns on corrupt data (silenced with a temporary error handler). cp437 table needs the final U+00A0, not a plain space. Not promoted to AGENTS.md.

### Docs updated
Inventory X-12, ledger #108/#110, sprint-status, DECISIONS/RISKS/ASSUMPTIONS.

### Open items
7.5a: php.ini `upload_max_filesize`/`post_max_size`; X-12 stays open for HTTP wiring.
