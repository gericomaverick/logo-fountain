# Logo Fountain — Assumptions Log

Format:
YYYY-MM-DD — <Assumption>. Evidence: <basis>. Review by: <date>. #assumption

---

2026-03-01 — Initial admin operations will be single-operator (one designer/admin role) with optional expansion later. Evidence: MVP focus + speed. Review by: 2026-03-10. #assumption
2026-03-01 — Professional promo code PRO40FIRST5 will be implemented via Stripe Promotion Codes (coupon + redemption limit) rather than custom discount logic. Evidence: Simplest robust enforcement. Review by: 2026-03-05. #assumption
2026-11-21 — Production creates the two DB roles out of band with the same attributes as dev (`docker/postgres/01-roles.sh`: NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT, database and schema `public` owned by the migrate role, `CONNECT` for the runtime only); `db:grants` only manages table/sequence privileges and `CREATE` on `public`. The runtime role must have no `TEMP` on the database. Evidence: story 2.1 decision 10; wherever it runs, `RuntimeRoleTest` checks the runtime role only: NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT, no `CREATE` or `TEMP` on the database, no `CREATE` on `public`, owns neither the database nor any table. It doesn't check the migrate role's attributes, who owns the database or schema, or which other roles have `CONNECT`. Review by: the deploy story (Epic 9). #assumption
2026-11-22 — Story 2.2: jsonb columns (`answers`, audit `payload`, …) are cast `'object'`, chosen from the Next shapes without checking every endpoint's response; 2.4's `Audit::record` must pass a `stdClass` for an empty payload (a PHP `[]` stores `[]`). Review by: Epic 6 first route. #assumption
2026-11-22 — `ProjectTimeline::build()` (story 2.3) receives timestamps already formatted as Next's ISO strings (`2026-01-01T09:00:00.000Z`); turning `timestamps(3)` columns into that format is the snapshot builder's job. Evidence: the fixture passes strings; Next's `buildTimeline` takes strings. Review by: the snapshot story (C-02). #assumption
2026-11-22 — Rate-limit windows (story 2.5) use each app process's PHP clock, so app servers and workers are assumed NTP-synced to well under a second; skew shifts a bucket's window by the skew. Evidence: one Forge server planned; DB `now()` would avoid it but can't be frozen in tests. Review by: Epic 9 (deploy). #assumption
2026-11-22 — Story 2.6: logical seed facts (counts, statuses, ids, state chains, entitlement triples; no timestamps, hashes or objects) are enough to call the Next and Laravel seeds equivalent; `seed-facts-next.sql`'s Prisma column names were written from `schema.prisma` and never run. Review: on the owner's first Next comparison. #assumption
2026-11-22 — Story 3.1: SeaweedFS 4.51 behaves like R2 for the conditional PUT (412 on an existing key), presign GET and the signed response disposition; proven by the L3 and 8-process race tests, not against real R2. Review by: Epic 9 first staging write. #assumption
2026-11-22 — Story 3.2: `getClientMimeType()` (browser-declared, never sniffed) is what the 7.5a controller passes, matching Next's `file.type`. #assumption
2026-11-22 — Story 3.4: object paths are random and immutable per upload, so bucket|path identifies the bytes. #assumption
2026-11-22 — Story 4.1: the session cookie behaves as asserted at the Laravel response level; the L4 parity contract against Laravel has not been run. Review by: when the Next parity suite is installed. #assumption
2026-11-22 — Story 4.2: the stand-in race actions have the same locking shape the real 4.5/4.6 actions will have (read version, write, delete proofs and sessions, all under the fence); the races are re-proved when those land. Review by: 4.6. #assumption
2026-11-23 — Story 5.1: FakeStripe (Pest) and stripe-fake accept the same session params as Stripe; the L4 parity specs (checkout-contracts, dv-checkout) have not been run against Laravel. Review by: the Epic 5 parity run. #assumption
2026-11-23 — Story 5.2: webhook claim lease stays 5 minutes as in Next. #assumption

2026-11-23 — Story 5.5: upsell metadata is trusted as far as it parses and is not re-checked against the paid line item (OQ 2). #assumption

2026-11-23 — Story 5.6: the existing 5.3 race test stands in for a reprocess-specific one, as both call the same action. #assumption

2026-11-23 — Story 5.7: no L4 parity run; the resolver and the three routes are proved against the in-process Stripe fake only, and the VAT line (K-11) is the hosted PDF/receipt itself and the later UI. #assumption
