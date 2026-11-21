# Logo Fountain — Assumptions Log

Format:
YYYY-MM-DD — <Assumption>. Evidence: <basis>. Review by: <date>. #assumption

---

2026-03-01 — Initial admin operations will be single-operator (one designer/admin role) with optional expansion later. Evidence: MVP focus + speed. Review by: 2026-03-10. #assumption
2026-03-01 — Professional promo code PRO40FIRST5 will be implemented via Stripe Promotion Codes (coupon + redemption limit) rather than custom discount logic. Evidence: Simplest robust enforcement. Review by: 2026-03-05. #assumption
2026-11-21 — Production creates the two DB roles out of band with the same attributes as dev (`docker/postgres/01-roles.sh`: NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT, database and schema `public` owned by the migrate role, `CONNECT` for the runtime only); `db:grants` only manages table/sequence privileges and `CREATE` on `public`. Evidence: story 2.1 decision 10; `RuntimeRoleTest` checks the attributes wherever it runs. Review by: the deploy story (Epic 9). #assumption
