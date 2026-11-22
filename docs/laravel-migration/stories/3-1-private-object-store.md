# Story 3.1: Private object store

**Status:** ready-for-dev (2026-11-22, created from `origin/main` df9e574) · **DoD variant:** Laravel-only · **Epic:** 3 · **Covers:** X-10, X-11, ADR-016 · **Gate:** `@storage&@unit`, `@pg-race` · **After:** 1.1a, 0.2 (both done) · **Stacks on:** `main`; touches `composer.json`/`composer.lock`, `config/portal.php`, `.env.example`, new files under `app/Support/Storage/`. 3.2, 3.3 and 3.4 don't touch these (3.4 *uses* this story's `sign()`).

> Created with BMAD `create-story` (docs only; no portal code written). Sources: `brownfield/storage-and-uploads.md` §1–4, ADR-016, `epics.md:273-278`, inventory X-10/X-11 (`01-feature-inventory.md:141-142`), ledger #92 and #106, and the Next files below, each `file:line` checked against `apps/web` on 2026-11-22.

## Story
As the portal, I need a private object store on the AWS SDK for PHP, so that concept images and final ZIPs are written once (never overwritten), read only through short presigned URLs, and a key collision fails closed.

## Acceptance criteria
From `epics.md:275-278` and ADR-016, expanded.
1. **Namespaces and config.** Two logical namespaces, `concepts` and `final-deliverables` (`r2.ts:11-12`); any other value throws "Unknown private storage namespace" (`:14-17`). Physical bucket names come from `config('portal.r2.*')` (`config/portal.php:27-35`); they must match `^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$` and **differ** (`:44-47`). `R2_ACCOUNT_ID` must match `^[a-f0-9]{32}`, `R2_JURISDICTION` is empty, `eu` or `fedramp`; a missing value throws "Missing private storage configuration: X" (`:101-111`). Endpoint `https://{account}[.{jurisdiction}].r2.cloudflarestorage.com`, or `R2_ENDPOINT` (the local/test seam) with path-style (`:112-117`). The DB never stores physical names.
2. **Object keys.** 1–1024 chars, no leading `/`, no control chars (`\x00-\x1f\x7f`) or `\`, no empty, `.` or `..` segments; otherwise throw "Invalid private object key" (`:19-25`).
3. **Write.** `putObject` with `IfNoneMatch => '*'`, `ContentType`, `ContentLength`, `CacheControl => 'private, max-age=3600'`, `ContentMD5` (base64 of the raw md5), `Metadata['sha256']` (hex) (`:49-60`). **Input:** `upload()` takes a `PreparedUpload` (3.2 defines it: temp-file `path`, `extension`, `contentType`, `size`), a deliberate departure from Next's in-memory `upload.bytes` (`r2.ts:56`) so a 95 MB ZIP isn't held in memory. The md5 (`hash_file('md5', …, true)`) and sha256 (`hash_file`) are computed by streaming the file, and the PUT `Body` is a stream opened on the path (`ContentLength` = `size`). If 3.1 builds before 3.2 exists, define against an interface/array of those four fields and align when 3.2 lands. Returns `{bucket, path, mime, size}`. There is **no overwrite path** and no flag for one.
4. **Collision (the epic's 412 case).** **Given** an existing key, **then** a second upload throws a collision error (the SDK's `S3Exception` with AWS error code `PreconditionFailed`, HTTP 412, mapped to one named `ObjectKeyCollision`), the first object's bytes are unchanged, and nothing is retried with overwrite (`r2.test.ts:27-33, 90-113`). Fallback: 0.2 found SeaweedFS **returns 412** (`0-2-…md:72`; 8 concurrent creates → one 200, seven 412), so **no fallback is needed** and this runs against SeaweedFS at L3. The L3-stub path stays documented only.
5. **Presign.** `sign(namespace, key, expiresIn = 3600, ?downloadFileName)`: expiry must be an **integer 1–3600**, else throw "Signed URL expiry must be an integer between 1 and 3600 seconds" (`:27-30`); a float, 0, 3601 and a numeric string all throw. Returns a SigV4 URL (`X-Amz-Algorithm=AWS4-HMAC-SHA256`, `X-Amz-Expires` = the ttl, 64-hex `X-Amz-Signature`). With a file name, a signed `response-content-disposition` from `safeDownloadDisposition`; without one, none (`:62-68`, `r2.test.ts:56-68`).
6. **Disposition cases ported** (`r2.ts:32-40`, `r2.test.ts:69-74`): NFC-normalise; replace `[\x00-\x1f\x7f-\x9f/\\";\u2028\u2029]` with `_`; keep at most **160 code points**; trim; empty → `final-deliverables.zip`. ASCII fallback = non-`\x20-\x7e` → `_`. UTF-8 form: lone surrogates fixed (invalid UTF-8 in PHP: replace with U+FFFD), percent-encoded as `encodeURIComponent` plus `'()*`. Result `attachment; filename="{ascii}"; filename*=UTF-8''{encoded}`. Cases: ` ` → default; 10,000 chars → under 400; a lone surrogate doesn't throw; `a\b;".zip` → `filename="a_b__.zip"`; `Lógó/"\r\nInjected: yes.zip` has no CR/LF and contains `filename*=UTF-8''L%C3%B3g%C3%B3`. Reuse `NodeCompat` for any JS-vs-PHP string difference.
7. **Never persisted or logged.** A presigned URL is not logged: the `Scrubber` (`app/Support/Scrubber.php`) test gains a case for an `X-Amz-Signature` URL if it doesn't already redact one. (Authorization is rechecked by the **caller** in the same transaction, `storage-and-uploads.md:36`; this story only provides `sign()`.)
8. **Health.** `HeadBucket` per namespace → `[{bucket, passed}]`, errors swallowed, no diagnostics (`:70-81`). Against SeaweedFS: both pass; with a missing bucket, that one is `passed:false`.
9. **Remove** (caller-only cleanup, `:83-98`): per file, namespace-confined, one `deleteObject`, counts acknowledged deletes, failures recorded as "Private object deletion was not confirmed"; returns `{attempted, deleted, failures}`. Nothing calls it automatically (the concept-upload abort path, 7.5a, is the only caller).
10. **Client options.** `region 'auto'`, `version 'latest'`, `request_checksum_calculation` and `response_checksum_validation` = `when_required`, `retries => 2` (3 attempts, as `maxAttempts: 3`) (`research-technical.md:205-209`). Flysystem is not used (ADR-016).
11. **Final filename** (ledger #92, X-11): `FinalDeliverableFilename::build(?company, ?clientName, ?email, \DateTimeInterface $createdAt)` → `{slug}-{YYYY-MM-DD, UTC}.zip`; slug = first non-empty of company, client name, email local part, then `logo-fountain`; slugify = lowercase, trim, non-`[a-z0-9]` runs → `-`, edges trimmed (`final-deliverable-filename.ts:34-50`; the two cases in `final-deliverable-filename.test.ts:6,16`). See open question 2.

## Inventory scope
- **X-10** (`01-feature-inventory.md:141`), **X-11** (`:142`): Laravel/Tests columns filled; both stay open until the callers (5.x/6.x/7.x, X-13) use the store and the `@storage` parity runs. Not in scope: validators (3.2, 3.3), the upload routes and request-key replay (7.5a, 7.8a, X-13), signed-URL placement in payloads (3.4 and Epic 6/7).
- ADR-016: implemented as written (record consequences in the Conversion record, not in the ADR).
- Ledger **#106** `r2.test.ts` (10 tests; the plan below maps cases 1–7 plus 8 = 8 cases, so the Conversion record must reconcile which of the 10 are ported or dropped; also add the `$` anchor Next has at `r2.ts:108` to the md5 check `^[a-f0-9]{32}$`, "Pest unit (S3 mock) + L3 SeaweedFS", `test-port-ledger.md:114`) and **#92** `final-deliverable-filename.test.ts` (2, `:100`).

## Next.js source read
- `apps/web/src/lib/storage/r2.ts` (138 lines): namespaces `:11-17`; key rules `:19-25`; expiry `:27-30`; disposition `:32-40`; class + upload `:42-60`; sign `:62-68`; health `:70-81`; remove `:83-98`; config `:101-121`; wrappers `:123-138`.
- `lib/storage/r2.test.ts` (114): cases at `:21, 27, 34, 56, 69, 75, 81, 90`. `lib/final-deliverable-filename.ts:34-50` and its test.
- Docs: `brownfield/storage-and-uploads.md` §1–4; ADR-016; `research-technical.md:42,98,203-209`; `0-2-…md:15,72`.

## Behaviour notes
- Order inside `upload`: key validated first, then one conditional PUT; there is no read-before-write (the 412 is the collision check).
- ContentMD5 is computed over the bytes (`:56`); a mismatch is rejected by the store with 400 `BadDigest` (0.2 probe). Required because checksums are `when_required`.
- Concept path `{projectId}/{conceptId}/v{N}.{uuid}.{ext}`, final path `{projectId}/finals/{uuid}.zip`; legacy reader path `{projectId}/{conceptId}.{ext}` (`storage-and-uploads.md:19-20`). The path is built by the **callers** (7.5a, 7.8a); the store only validates and writes the key it is given.
- Signed URLs for concepts last 3600 s, finals 3600 s with a disposition (`:131-135`); the caller passes the file name from #92.
- No housekeeping job; bytes are kept on reset, delete and replace (an accepted residual risk).

## Laravel guidance
- `app/Support/Storage/PrivateStorage.php` (final class, constructed from an `S3Client` and the two bucket names; a `PrivateStorage::fromConfig()` factory reads `config('portal.r2')`, bound as a singleton in a provider). `SignedUrlExpiry`/`DownloadDisposition` as static helpers in `app/Support/Storage/`; `ObjectKeyCollision` exception beside them; `FinalDeliverableFilename` in `app/Support/`.
- `composer require aws/aws-sdk-php:^3.402` (not in `composer.json` today; 3.402.3 verified in `research-technical.md:98`).
- Config only through `config/portal.php` (AGENTS rule: env is read in config only); validation of the `r2.*` values goes in the factory and throws `InvalidConfiguration` (`app/Support/InvalidConfiguration.php`).
- Logs and exceptions never carry the URL or the secret key.

## Planned deviations from Next.js
- Collision surfaces as `ObjectKeyCollision` (a named exception) instead of a raw `PreconditionFailed` error; callers map it to the existing collision handling. Observable HTTP behaviour is the caller's (7.5a).
- Env: `.env.example:65-71` still has dev `AWS_*` names for SeaweedFS while `config/portal.php` reads `R2_*`; see open question 1.

## Tasks
1. `composer require aws/aws-sdk-php:^3.402`; commit lock. Provider binding + `fromConfig()` with AC 1, 10.
2. `PrivateStorage`: key/namespace checks (AC 2), `upload` (AC 3, 4), `sign` + expiry (AC 5), `health` (AC 8), `remove` (AC 9).
3. `DownloadDisposition::for()` with the AC 6 cases; `FinalDeliverableFilename` (AC 11).
4. Scrubber case (AC 7). `.env.example` and config doc lines (open question 1).
5. Tests per the plan; `bin/test`; Conversion record; inventory X-10/X-11, ledger #92/#106, `sprint-status` → review.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 `@storage @unit` | `tests/Unit/Support/Storage/DownloadDispositionTest.php` (AC 6 cases + a Unicode dataset), `SignedUrlExpiryTest.php` (1, 3600 pass; 0, 3601, 1.5, "10", NaN-like throw), `ObjectKeyTest.php` (AC 2 datasets), `FinalDeliverableFilenameTest.php` (#92 two cases plus UTC date edge: `23:59:59-05:00`) | X-10, X-11 |
| L1 `@storage @unit` (S3 mock) | `PrivateStorageTest.php` with the SDK `MockHandler`: the command carries `IfNoneMatch '*'`, `CacheControl`, MD5, sha256 metadata; a 412 → `ObjectKeyCollision`, one call only, never retried with overwrite; presign output params (AC 5); `remove` counts (AC 9); health hides errors; client options (AC 10); config validation (AC 1) | #106 cases 1–7 |
| L3 `@storage` (SeaweedFS) | `tests/Feature/Storage/PrivateStorageSeaweedTest.php`: second PUT of the same key → collision, first bytes survive; `HeadBucket` pass/fail; presigned GET fetched over HTTP returns the body and, for a final, the echoed disposition | #106 case 8, X-10 |
| L3 `@pg-race` | `tests/Concurrency/ObjectStoreCollisionRaceTest.php`: 8 `proc_open` children PUT one key → exactly one wins, seven collide, stored bytes equal the winner's (the 0.2 probe, in PHP) | X-10 |
| Arch | `tests/Arch/StorageTest.php`: nothing under `app/` outside `Support/Storage/` uses `Aws\\`, `Illuminate\Support\Facades\Storage` or `League\Flysystem` for private objects | ADR-016 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review` and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. No parity (L4/L5) run: the HTTP subset is gated in the story named under *Dependencies*.

## Dependencies and follow-ups
- Consumers: 3.4 (`sign`), 7.5a (upload, collision, `remove`), 7.8a (final upload, disposition), Epic 5/6 payloads. `@storage&@security` parity for X-11 (authorisation recheck) runs in those stories.
- Buckets in the portal SeaweedFS (`compose.yaml:88-98`) must exist for the L3 tests: already satisfied: `compose.yaml:93` sets `S3_BUCKETS: portal-concepts,portal-finals` and `start.sh` passes it to `weed mini -bucket`. The L3 tests need `R2_*` set to those bucket names and the dev keys (`config/portal.php` reads `R2_*`; `.env.example:65-71` has stale `AWS_*` lines, replace them with `R2_*`: in scope, note it in the Conversion record).

## Open questions (with recommendations)
1. **Env names.** `.env.example` has `AWS_*` for the dev SeaweedFS, `config/portal.php` reads `R2_*` + `R2_ENDPOINT`. *Recommendation:* use `portal.r2.*` only (Next's names, so the env doesn't change at cutover, ADR-016/1.3) and replace the `AWS_*` dev lines with `R2_*` pointing at SeaweedFS; `R2_ACCOUNT_ID` must still be 32 hex in dev. Conflict between `.env.example` and config, not between ADR and Next.
2. **Where does ledger #92 (final filename) land?** The epic lists only X-10/X-11 for 3.1, but the ledger puts #92 under X-11 (C-13). *Recommendation:* here (pure function, no DB); 7.8a only calls it.
3. **`remove` in 3.1?** The epic doesn't list it; it is part of the Next class and only 7.5a calls it. *Recommendation:* build it here with the tests above, so 7.5a doesn't touch the store.
4. **Exception name for 412.** *Recommendation:* `ObjectKeyCollision` extending `RuntimeException`, carrying no URL or key secrets.
5. **Epic vs 0.2 on the fallback.** `epics.md:276` says "if 0.2 recorded the fallback, run at L3 with the stub"; 0.2 recorded **no fallback**. Treat the epic line as moot; no L9 move. Note the epic wording as stale in the Conversion record.
6. **Owner items: none.** ADR-016 *Consequences* stays empty by rule; the record holds them.

## Doc / code disagreements and citation fixes
- None found in `r2.ts`/`brownfield` §1–4 beyond open question 1. `brownfield/storage-and-uploads.md:19` calls `upsert` a parameter of the Next wrappers (`r2.ts:123`); Laravel has no such parameter.

## Conversion record

> Fill at implementation, from `templates/story-conversion-record.md`. Write *Behaviour notes* before converting.

### Inventory scope
X-10, X-11 (Laravel/Tests columns; both stay open until callers land). ADR-016. Ledger #92, #106.

### Next.js source read
`apps/web/src/lib/storage/r2.ts`, `r2.test.ts`, `final-deliverable-filename.ts` (+ test); `brownfield/storage-and-uploads.md` §1–4; ADR-016; `research-technical.md`.

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
