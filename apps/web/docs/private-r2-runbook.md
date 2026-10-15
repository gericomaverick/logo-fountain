# Private R2 operations (5649)

This is a configuration/acceptance plan, **not evidence of a configured or tested live bucket**. No Cloudflare resource operations are authorized by this change. Supabase Auth/DB exit is a separate incomplete stage: this R2 change alone does not complete the exit.

## Configuration and least privilege

Use two private operator-provisioned buckets. Set server-only `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_CONCEPTS_BUCKET`, `R2_FINAL_DELIVERABLES_BUCKET`. Optional `R2_JURISDICTION=eu|fedramp` selects the account's jurisdiction endpoint; it must match both bucket locations. Never prefix secrets with NEXT_PUBLIC. No public access/r2.dev/custom public bucket endpoint. The SDK uses region `auto` and the HTTPS account R2 S3 endpoint. No arbitrary endpoint is accepted from application environment.

Use only bucket-scoped object permissions needed by this server: reads/signing and conditional writes, bucket HEAD for health, and deletion only if failed-publication cleanup is enabled. Never use account-admin or bucket-creation credentials. Separate future housekeeping credentials, manual authorization and audited manifest from ordinary publication. Cloudflare's available token permission bundles may grant deletion with write: document that residual permission; it is not authorization for lifecycle deletion.

Upload/metadata references preserve logical `concepts` and `final-deliverables` namespaces; physical bucket names come from environment. Changing physical mappings after data exists is a data operation and requires a plan. PutObject includes `If-None-Match: *`: collision, uncertain write acknowledgement or retry collision cannot silently replace bytes. Metadata carries SHA-256 and Content-MD5 protects transmitted payload. Automatic optional SDK checksums are disabled for R2 compatibility; required checksums remain enabled. SDK command compatibility tests are not service acceptance evidence.

Signed GET capabilities expire in 1..3600 seconds and may remain usable after app authorization changes. They must not appear in logs, error diagnostics, receipts or persisted metadata. Final download disposition is sanitized, length-bounded and part of the signature. Browser direct uploads are not used. No CORS is needed for current server uploads, image display, or navigation/download. If browser fetch/Canvas use is introduced, explicitly allow only trusted app origins, GET/HEAD and required headers; never grant wildcard credentialed CORS or write methods.

## Retention and costs

Preserve immutable objects indefinitely until an owner-approved audited policy exists. Clean-slate reset removes publication metadata, **not concept or final bytes**. Previously issued URLs and durable receipts require this retention. Failed or ambiguously committed publication can deliberately leave orphans. Do not add a blanket bucket expiration rule; deletion must consider outstanding URLs (at least one hour), all durable receipts/recovery, active/superseded references, audit records and backup retention. The present intentional policy is unbounded and has a cost risk.

At the researched pricing page, standard storage includes 10 GB-month, Class A 1M/month and Class B 10M/month free usage. Verify current pricing/account eligibility before release; infrequent-access terms differ. Usage dashboards, alerts and billing notifications are **not hard spending caps**. Monitor bytes/orphans, operations, retry rates, presign issuance and unusual downloads. Rate limits and payload bounds mitigate abuse but cannot guarantee a maximum bill.

## Backup/restore

Back up PostgreSQL and object bytes plus namespace/key/MIME/size/SHA-256 inventories to a separately secured destination; an R2 bucket itself is not a backup. Encrypt backups, restrict credentials, set owner-approved RPO/RTO and retention. Restore to separate private test buckets and isolated DB, remap physical namespaces, verify all active references and retained receipts, sample/hash all restored bytes as appropriate, exercise authorized signed downloads, and only then consider a separately authorized cutover. Do not restore metadata alone or purge source bytes based on row deletion.

## Live acceptance gate — NOT RUN

With separately authorized isolated credentials/resources: anonymous reads fail; HEAD works with intended scoped token; two identical-key conditional writes cannot replace the first payload; canonical content type and integrity metadata survive; keys from both logical namespaces resolve correctly; sanitized Unicode/download disposition is correct; expiry <=1h and post-expiry access fails; active-final selection/authorization is exact; old URL still retrieves identical bytes after replacement and metadata reset; receipt-backed retries preserve bytes. Check real SDK retry/error behavior and health sanitization. No private object bytes, secrets or signed query strings should be included in evidence logs.

Local test evidence uses actual AWS SigV4 presigning and a disposable loopback HTTP S3 protocol harness; it is neither MinIO nor Cloudflare acceptance.
