# Logo Fountain — Assumptions Log

Format:
YYYY-MM-DD — <Assumption>. Evidence: <basis>. Review by: <date>. #assumption

---

2026-03-01 — Initial admin operations will be single-operator (one designer/admin role) with optional expansion later. Evidence: MVP focus + speed. Review by: 2026-03-10. #assumption
2026-03-01 — Professional promo code PRO40FIRST5 will be implemented via Stripe Promotion Codes (coupon + redemption limit) rather than custom discount logic. Evidence: Simplest robust enforcement. Review by: 2026-03-05. #assumption
2026-11-21 — Production creates the two DB roles out of band with the same attributes as dev (`docker/postgres/01-roles.sh`: NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT, database and schema `public` owned by the migrate role, `CONNECT` for the runtime only); `db:grants` only manages table/sequence privileges and `CREATE` on `public`. The runtime role must have no `TEMP` on the database. Evidence: story 2.1 decision 10; wherever it runs, `RuntimeRoleTest` checks the runtime role only: NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT, no `CREATE` or `TEMP` on the database, no `CREATE` on `public`, owns neither the database nor any table. It doesn't check the migrate role's attributes, who owns the database or schema, or which other roles have `CONNECT`. Review by: the deploy story (Epic 9). #assumption
2026-11-22 — Story 2.2: jsonb columns (`answers`, audit `payload`, …) are cast `'object'`, chosen from the Next shapes without checking every endpoint's response; 2.4's `Audit::record` must pass a `stdClass` for an empty payload (a PHP `[]` stores `[]`). Review by: Epic 6 first route. #assumption
