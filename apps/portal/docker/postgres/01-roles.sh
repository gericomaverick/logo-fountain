#!/bin/sh
# Local dev only (ADR-013): a schema-owner role and a DML-only runtime role, for the dev and test databases.
# Dev-only passwords; production roles and grants are provisioned by ops/ (O-06).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<'SQL'
CREATE ROLE portal_migrate LOGIN PASSWORD 'dev-only-migrate';
CREATE ROLE portal_runtime LOGIN PASSWORD 'dev-only-runtime';
CREATE DATABASE portal OWNER portal_migrate;
CREATE DATABASE portal_test OWNER portal_migrate;
SQL
for db in portal portal_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO portal_migrate;
GRANT USAGE ON SCHEMA public TO portal_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO portal_runtime;
SQL
done
