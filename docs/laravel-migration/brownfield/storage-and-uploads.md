# Brownfield: private storage (R2) and upload validation (as built)

Phase 0 capture, 2026-11-18. Covers **X-10…X-13, C-09, C-13, D-05, D-11, D-13**. Source: `apps/web/src/lib/storage/r2.ts`, `lib/upload-validation.ts`, `lib/zip-validation.ts`, `lib/final-deliverable-filename.ts`.

## 1. Storage client

- S3 client: `region: "auto"`, endpoint `https://{R2_ACCOUNT_ID}[.{R2_JURISDICTION}].r2.cloudflarestorage.com`, `maxAttempts: 3`, checksum calculation and validation `WHEN_REQUIRED`.
- Config validation: `R2_ACCOUNT_ID` must match `^[a-f0-9]{32}$`. `R2_JURISDICTION` is empty, `eu` or `fedramp`. Bucket names must match `^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`, and **the two buckets must be different**. Missing config → throw "Missing private storage configuration: X".
- Logical namespaces are stored in `FileAsset.bucket`: `concepts` and `final-deliverables`. The physical names come from `R2_CONCEPTS_BUCKET` and `R2_FINAL_DELIVERABLES_BUCKET`. **The DB never stores physical bucket names.**
- Object key rules: 1–1024 chars, doesn't start with `/`, no control characters or `\`, and no empty, `.` or `..` segments.

## 2. Writes (immutable)

`PutObject` with `IfNoneMatch: "*"` (fails if the key exists), `ContentType` (canonical MIME), `ContentLength`, `CacheControl: "private, max-age=3600"`, `ContentMD5` (base64), and metadata `sha256` (hex). **There's no overwrite path** (`upsert` must be false).
- Concept path: `{projectId}/{conceptId}/v{N}.{uuid}.{ext}`. Legacy readers also accept `{projectId}/{conceptId}.{ext}` (v1).
- Final path: `{projectId}/finals/{uuid}.zip`.
- Laravel: the AWS SDK for PHP `putObject` with `IfNoneMatch => '*'`, `ContentMD5`, `Metadata => ['sha256' => …]`. Flysystem can't pass `If-None-Match`, so it isn't used for writes. **E0 task:** confirm SeaweedFS honours `If-None-Match: *` (if not, test the conditional write against a stub at L3 and leave the live check to L9).

## 3. Reads (presigned only)

- `GetObject` presign, expiry an **integer 1–3600** (otherwise throw). Concept images: 3600 s. Finals: 3600 s plus a signed `ResponseContentDisposition`.
- `safeDownloadDisposition(name)`: NFC-normalise, replace `[\x00-\x1f\x7f-\x9f/\\";  ]` with `_`, truncate to 160 code points, trim (empty → `final-deliverables.zip`). The ASCII fallback replaces non-`\x20-\x7e` with `_`. The UTF-8 version gets lone surrogates fixed (`toWellFormed`), then `encodeURIComponent` with `'()*` also percent-encoded. Result: `attachment; filename="{ascii}"; filename*=UTF-8''{encoded}`. Port it with the existing unit cases.
- Final filename (`buildFinalDeliverableFilename`): `{slug}-{YYYY-MM-DD of asset createdAt, UTC}.zip`. The slug is the first non-empty of company (client.name), the owner's name, the owner's email local part, then `logo-fountain`. Slugify = lowercase, trim, non-`[a-z0-9]` runs become `-`, edges trimmed.
- **Signed URLs are never stored or logged.** Authorization is always rechecked in the same transaction right before signing.

## 4. Delete and health

- `remove(files)` is called **only** by the concept-upload abort cleanup. It counts acknowledged deletes and records failures as "Private object deletion was not confirmed". No other path deletes objects: reset, concept delete and final replacement all **keep** bytes. There's no housekeeping job (an accepted residual risk in `docs/TODO.md`).
- Health: `HeadBucket` per namespace → passed or failed, with no diagnostics.

## 5. Concept image validation (`prepareConceptImage`)

Order matters: the size check comes **before** the bytes are read.
1. Size 0 → `FILE_REQUIRED` "Concept image is empty". Over **10 MiB** → `FILE_TOO_LARGE` "Concept image exceeds the 10 MB limit".
2. The extension (`png|jpg|jpeg|webp`) **and** the browser-supplied MIME must match (`image/png`, `image/jpeg`, `image/webp`), otherwise `INVALID_FILE_TYPE` "Use a PNG, JPEG, or WebP image with matching file extension and MIME type". `jpeg` is stored as `jpg`.
3. A hand-written byte-level structural validator for each format (no decoding library). Dimensions > **40,000,000 pixels** → `IMAGE_DIMENSIONS_TOO_LARGE`. Bad signature → `FILE_SIGNATURE_MISMATCH`. Everything else → `MALFORMED_IMAGE` with specific messages:
   - **PNG:** signature, IHDR first (length 13), valid bit depth and colour type pairs, compression/filter 0, interlace ≤1, a CRC check on **every chunk**, APNG chunks (`acTL/fcTL/fdAT`) rejected, PLTE rules, contiguous IDAT, unknown critical chunks rejected, IEND empty and **at end of file** (no trailing bytes).
   - **JPEG:** SOI, a marker walk, exactly one SOF0/1/2 frame with 1–4 components, DNL rejected, at least one valid SOS, EOI **at end of file**.
   - **WebP:** the RIFF size must equal the file length. VP8X (static only, reserved bits zero) dimensions are checked against the VP8 or VP8L payload. Exactly one image payload. Animation rejected. Allowed extra chunks: ALPH, ICCP, EXIF, `XMP `.
4. Error response: `400 {error:{message, code}}` from the concept upload route.

## 6. Final ZIP validation (`prepareFinalZip`, `validateZip`)

1. Size 0 → `FILE_REQUIRED`. Over **100 MiB** → `FILE_TOO_LARGE` (Next; **Laravel: 95,000,000 bytes, DV-13**). The extension must be `zip` and the MIME `application/zip` or `application/x-zip-compressed`, otherwise `INVALID_FILE_TYPE`. The first 4 bytes must be `PK\x03\x04`, otherwise `FILE_SIGNATURE_MISMATCH`.
2. A structural walk (`MALFORMED_ZIP` unless stated otherwise):
   - EOCD found within the last 65,557 bytes, with the comment ending exactly at the end of file. Single volume. Entry count is non-zero and **≤ 1000** (otherwise `ZIP_LIMIT_EXCEEDED`). The central directory ends exactly at the EOCD.
   - Per entry: no ZIP64, no split, no encryption. Methods are only stored (0) or deflate (8), with allowed flags `0x800|8|6`. Names are UTF-8 (flag 0x800, strict) or CP437. **Name safety:** NFKC-canonical, no `\`, controls or `:`, no leading `/`, no empty, `.` or `..` segments, no trailing dot or space, no Windows reserved names. **Case-insensitive collision** rejected. A file used as a parent directory is rejected.
   - External attributes: only regular files and directories, no symlinks or specials, and consistent directory flags. Extra fields `0x7075 0x6375 0x0001 0x000d 0x756e` are rejected.
   - The local header must match the central record (flags, method, name). Data-descriptor handling (signed and unsigned) and size/CRC consistency. Local records are contiguous, with no overlap or gaps, and end exactly at the central directory.
   - Limits: declared size ≤ **500 MiB**, declared size ≤ max(1, compressed) × **100**. Then **actual streaming inflation** in 16 KiB chunks enforces the same per-entry and **total** (500 MiB) limits and checks the actual size and CRC-32. Trailing compressed data is rejected.
3. Laravel: port this to PHP **byte for byte** (`unpack('v'/'V')`, `inflate_init(ZLIB_ENCODING_RAW)` with incremental `inflate_add` for streaming, a CRC-32 via `hash('crc32b')` or an incremental `hash_init`). **Don't** use `ZipArchive` for validation: it follows a different parsing path and would accept files this validator rejects.

## 7. Shared golden fixture corpus (test strategy addition)

These validators are the highest-risk thing to port by hand. E0 builds `tests/parity/fixtures/uploads/`: a corpus of valid and malicious files (good PNG/JPEG/WebP; APNG; animated WebP; trailing bytes; bad CRC; 40 MP+ header; zip bomb; ZIP64; symlink entry; path traversal; case collision; CP437 names; data descriptors; 1001 entries). Each file is paired with its **expected error code**, captured from the Next implementation. The Next Vitest suite and the Laravel Pest suite both run against this corpus, and the parity suite uploads a subset through HTTP.

- (story 0.8e) Confirmed on Next: a 95,000,001-byte ZIP is accepted and the client is emailed N-09 (the Laravel cap is DV-13).
