# apps/portal: agent guide

Placeholder until story 1.2 writes the full guide (architecture §5 rules plus the DoD variants).

- **Start here:** `../../docs/laravel-migration/RESUME.md`, then `handoff.md`.
- **No PHP or Composer on the host.** Everything runs in Docker: `docker compose up`, then `bin/artisan`, `bin/composer`, and `bin/test` (Pint, Larastan level 9, Pest). Don't install PHP on the host and don't add Laravel Boost; neither is in the architecture.
- **DB roles (ADR-013):**
  - the default `pgsql` connection is the runtime role (DML only);
  - schema changes use `--database=pgsql_migrate`;
  - rate limits use `pgsql_limits`.
- **Pins:** follow `research-technical.md` §2 and its pin policy. Composer uses carets plus the lock file; npm uses exact versions.
