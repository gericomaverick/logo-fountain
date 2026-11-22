#!/bin/sh
# Local dev only (ADR-013): a schema-owner role and a DML-only runtime role, for the dev and test databases.
# Dev-only passwords; production roles are provisioned in Epic 9 with the same attributes. Role attributes and
# database access as Next's isolated runner (story 2.1 decision 10). Runs only on a fresh volume (down -v).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<'SQL'
CREATE ROLE portal_migrate LOGIN PASSWORD 'dev-only-migrate' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
CREATE ROLE portal_runtime LOGIN PASSWORD 'dev-only-runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
CREATE DATABASE portal OWNER portal_migrate;
CREATE DATABASE portal_test OWNER portal_migrate;
REVOKE ALL ON DATABASE portal FROM PUBLIC;
REVOKE ALL ON DATABASE portal_test FROM PUBLIC;
GRANT CONNECT ON DATABASE portal TO portal_runtime;
GRANT CONNECT ON DATABASE portal_test TO portal_runtime;
SQL
# The grants themselves (DML, default privileges, revokes) are applied by `php artisan db:grants` after migrating.
for db in portal portal_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO portal_migrate;
SQL
done
