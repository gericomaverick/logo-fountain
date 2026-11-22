-- O-06 / ADR-013: least-privilege grants for the runtime role. Port of apps/web/ops/postgres/runtime-grants.sql.
-- Run only through `php artisan db:grants` (as the migrate role, after every `migrate --database=pgsql_migrate`):
-- the command replaces {{runtime_role}} with the quoted runtime role from config and runs this file in
-- one transaction. Every statement is idempotent, so running it twice changes nothing.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO {{runtime_role}};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {{runtime_role}};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {{runtime_role}};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {{runtime_role}};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {{runtime_role}};
-- The runtime needs no access to migration history.
REVOKE ALL ON TABLE migrations FROM {{runtime_role}};
REVOKE ALL ON SEQUENCE migrations_id_seq FROM {{runtime_role}};
-- Operator bootstrap state is never accessible to the runtime. Future migrations adding operator
-- tables MUST explicitly revoke their default runtime grants here.
REVOKE ALL ON TABLE auth_admin_bootstrap FROM {{runtime_role}};
