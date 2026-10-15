-- MANUAL/operator-authorized provisioning template; run as migration owner
-- after migrations, against a confirmed NEW database only. Role lf_runtime must
-- already exist, distinct from migration owner. Never run against live by default.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO lf_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lf_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lf_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lf_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lf_runtime;
-- Library/runtime needs no mutation access to migration history.
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM lf_runtime;
  END IF;
END $$;
