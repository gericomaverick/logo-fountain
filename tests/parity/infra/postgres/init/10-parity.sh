#!/bin/sh
# Parity stack database bootstrap (story 0.2). Runs once, on first start, as the
# postgres superuser, inside the database POSTGRES_DB (lf_parity).
#
# - Roles (ADR-013; Next's prisma.config needs distinct runtime and migrate users):
#     lf_migrate  LOGIN, owner of database lf_parity, schema public and schema parity
#     lf_runtime  LOGIN, CONNECT only here. Table grants come from the app's grant
#                 script after migrations (apps/web/ops/postgres/runtime-grants.sql).
# - parity.parity_marker: the seed guards (story 0.4) refuse to run unless it exists.
#   It lives in its own schema because `prisma migrate deploy` refuses a non-empty
#   public schema (P3005). public stays empty.
# Passwords come from docker-compose.test.yml and are TEST-ONLY throwaway values.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v runtime_role="$PARITY_PG_RUNTIME_ROLE" -v runtime_pw="$PARITY_PG_RUNTIME_PASSWORD" \
  -v migrate_role="$PARITY_PG_MIGRATE_ROLE" -v migrate_pw="$PARITY_PG_MIGRATE_PASSWORD" <<'SQL'
CREATE ROLE :"migrate_role" LOGIN PASSWORD :'migrate_pw';
CREATE ROLE :"runtime_role" LOGIN PASSWORD :'runtime_pw';

ALTER DATABASE lf_parity OWNER TO :"migrate_role";
ALTER SCHEMA public OWNER TO :"migrate_role";
REVOKE ALL ON DATABASE lf_parity FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE lf_parity TO :"runtime_role";

CREATE SCHEMA parity AUTHORIZATION :"migrate_role";
CREATE TABLE parity.parity_marker (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO parity.parity_marker (purpose)
  VALUES ('Disposable parity test database. Seeding and destructive test tooling may run here.');
ALTER TABLE parity.parity_marker OWNER TO :"migrate_role";
GRANT USAGE ON SCHEMA parity TO :"runtime_role";
GRANT SELECT ON parity.parity_marker TO :"runtime_role";
SQL
