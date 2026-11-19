# Story 0.6a: Golden upload corpus

Status: done

## Story

As the delivery team,
I want a shared, deterministic corpus of valid and malicious upload files, each paired with the exact error code Next's validator returns,
so that the hand-ported Laravel image and ZIP validators (stories 3.2, 3.3) can be proven identical to Next.

**Covers:** X-12 · **Gate:** `@uploads&@unit` · **After:** 0.1 · **DoD variant:** E0 (spec)

## Acceptance criteria

1. **Given** each corpus file (valid and malicious PNG, JPEG, WebP and ZIP; the boundaries at exactly 10 MiB, 40,000,000 pixels and the ZIP limit), **then** Next's validator returns the recorded code, read by Vitest from the shared files.
2. Codes are captured from Next (`CAPTURE=1`), not written by hand. Each file is also checked to reach the validator branch it was built for (its Next message), so a file can't drift onto another rejection that happens to share the code.
3. Every file is built by `generate.mjs`. Committed files are under 200 KB each. Large boundary files are built on demand into a git-ignored `.generated/` dir and verified by sha256.
4. Where Laravel deliberately differs (DV-13), the manifest says so in `laravelExpectedCode`.

## Tasks / subtasks

- [x] `tests/parity/fixtures/uploads/generate.mjs`: dependency-free builders for PNG, JPEG, WebP and ZIP, plus 267 case definitions
- [x] `manifest.json` (id, file, kind, filename, mime, expectedCode, branch, generated, size, sha256, note, optional laravelExpectedCode)
- [x] `.gitignore` (`.generated/`)
- [x] `apps/web/src/lib/__tests__/golden-upload-corpus.test.ts` (assert mode + `CAPTURE=1` mode)
- [x] Capture → review → normal run; negative check; full unit suite; `npm run check`
- [x] `tests/parity/README.md`: one table row for the corpus

## Dev notes

- Source of truth: `apps/web/src/lib/upload-validation.ts` and `zip-validation.ts`, plus their tests. Spec: `brownfield/storage-and-uploads.md` §5–§7.
- **Determinism.** No system zlib. DEFLATE is a small fixed-Huffman encoder (`generate.mjs:99`), so the bytes don't depend on the Node or zlib version. Real JPEG/WebP seeds (8×8, encoded once with sharp) are frozen as base64 (`generate.mjs:156`). `forceCrc` (`:62`) builds a payload whose CRC equals the data-descriptor signature. `ratioEntry` (`:274`) finds a deflate entry at exactly 100× compression.
- **Large files** (`generated: true`, 8 entries, 7 files, ~410 MB): exactly 10 MiB and 10 MiB+1 PNG; ZIPs of 95,000,000, 95,000,001, 104,857,600 and 104,857,601 bytes; a 600 MiB-actual-expansion ZIP (8.2 MB on disk). The test's `beforeAll` runs `generate.mjs --generated` when any are missing (~10 s). Re-running it checks the sha256 against the manifest.
- **Header-only / structure-only files** (said so in `note`): `png-40mp-*`, `jpeg-40mp-*`, `webp-*-40mp*`, `jpeg-stuffing-and-restarts`, `webp-vp8x-metadata`. Their headers are valid, but they aren't full decodable images. The validators don't decode. All other accepted images decode with sharp, and the accepted ZIPs pass Python `zipfile.testzip()`.
- `File.type` is lower-cased by the `File` constructor. That's why the manifest MIMEs are lower case. A Laravel/HTTP harness should send `mime` exactly as written.
- References: `epics.md` 0.6a, 3.2, 3.3; `01-feature-inventory.md` X-12, DV-13; ADR-017 (byte-for-byte port, no `ZipArchive`).

## Conversion record

### Inventory scope
X-12 (corpus and Next capture). DV-13 is recorded as data for 3.3.

### Next.js source read
`upload-validation.ts:34-39` (size before read), `:53-60` (dimensions), `:62-96` PNG, `:98-134` JPEG, `:136-168` WebP, `:170-195` entry points. `zip-validation.ts:213-223` (names), `:225-326` (structure, limits, streaming inflate).

### Behaviour notes
- Order: size (`FILE_REQUIRED`/`FILE_TOO_LARGE`) → extension+MIME (`INVALID_FILE_TYPE`) → signature → structure. Cases `image-empty-wrong-type` and `image-10mib-plus-1-wrong-type` pin that order.
- Both limits are inclusive: exactly 10 MiB, exactly 40,000,000 px, exactly 1000 entries, ratio exactly 100 and exactly 100 MiB are all accepted.
- The EOCD scan runs backwards, so a 22-byte fake EOCD at the end of the comment wins (`zip-fake-eocd-in-comment` → `MALFORMED_ZIP` "Multivolume/empty"). A PHP port has to scan the same way.
- CP437 names go through NFKC: 0xAB (½) and 0xFF (NBSP) are rejected as noncanonical. 0x81/0x82 (ü/é) are accepted.
- Captured code totals: image 25 null, 85 `MALFORMED_IMAGE`, 7 `IMAGE_DIMENSIONS_TOO_LARGE`, 7 `FILE_SIGNATURE_MISMATCH`, 10 `INVALID_FILE_TYPE`, 2 `FILE_REQUIRED`, 2 `FILE_TOO_LARGE`. ZIP 20 null, 90 `MALFORMED_ZIP`, 6 `ZIP_LIMIT_EXCEEDED`, 5 `FILE_SIGNATURE_MISMATCH`, 6 `INVALID_FILE_TYPE`, 1 `FILE_REQUIRED`, 1 `FILE_TOO_LARGE`.

### Validator branches not covered
These can't be reached through `prepareConceptImage`/`prepareFinalZip`:
- `zip-validation.ts:229`: the `u32(0) !== PK\3\4` half. `prepareFinalZip` (`upload-validation.ts:192`) rejects first with `FILE_SIGNATURE_MISMATCH`. The `< 22 bytes` half is covered.
- `zip-validation.ts:304`: actual ratio over 100. It's implied by `actual ≤ declared ≤ 100 × compressed` (`:286`), which is checked first.

Sub-conditions that share one expression and one message (for example each reserved VP8X byte, each VP8 start-code byte, each control character) have one representative case each.

### Laravel implementation
None (E0). Stories 3.2/3.3 must load `manifest.json`, build each upload from `file`/`filename`/`mime`, and assert `laravelExpectedCode ?? expectedCode`. Matching `branch` (the message) is recommended for a byte-for-byte port, but not required.

### Deviations from Next.js
DV-13 only: `zip-95000001` and `zip-100mib-exact` are null on Next and `laravelExpectedCode: FILE_TOO_LARGE`. `zip-95000000` is null on both. `zip-100mib-plus-1` is `FILE_TOO_LARGE` on both (the message differs).

### Tests
| Layer | Test | IDs |
|---|---|---|
| L1 (Vitest) | `apps/web/src/lib/__tests__/golden-upload-corpus.test.ts:74`: one test per corpus case (code, branch, size, sha256) | X-12 |
| L1 | `golden-upload-corpus.test.ts:69`: committed files and manifest equal `generate.mjs --check` output | X-12 |

### Test evidence (2026-11-19)
- `CAPTURE=1 npx vitest run src/lib/__tests__/golden-upload-corpus.test.ts`: 268 passed. Every file reached its intended branch on the first capture.
- Normal mode, `.generated/` deleted first (regenerated and sha256-verified): **268 passed** (~17 s).
- Negative check: one tampered `expectedCode`, one tampered `branch` → 3 failures (case, case, manifest drift), then restored.
- `npm run test` (apps/web): **990 passed, 20 skipped** (baseline 722 + 268; skipped unchanged). `npm run typecheck`: clean. `npx eslint` on the new file: clean.
- `tests/parity`: `npm run check`: OK. `node fixtures/uploads/generate.mjs --check`: OK (259 committed, 8 generated).

### Gotchas
- The worktree had no `node_modules` or generated Prisma client (`apps/web/src/generated`, git-ignored). Both were symlinked from the main checkout for the run. Nothing was committed.
- Re-run `node generate.mjs --committed` after a capture run, so the manifest key order matches the generator (otherwise `--check` fails).

### Docs updated
`tests/parity/README.md` (corpus row). This story file.

### Open items
- Parent: log the **O-09 freeze exception** (one new test-only file in apps/web), and update the inventory X-12 row, sprint-status, handoff.
- HTTP upload subset of the corpus: stories 7.5a/7.8a.


## Parent review (2026-11-19)
Cherry-picked to main and re-run: 268/268. The new test file is recorded under the O-09 freeze exceptions.
