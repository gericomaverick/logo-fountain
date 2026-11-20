# Logo Fountain portal (Laravel)

The client and admin portal, replacing `apps/web` (Next.js). Plan and status: `docs/laravel-migration/`.

```bash
docker compose up -d      # first run: .env, composer install, key, migrations (the init service)
open http://localhost:8080          # app (and /up for the health check)
bin/test                  # Pint, Larastan level 9, Pest
```

Dev ports bind to 127.0.0.1:
- 8080 app
- 5173 Vite
- 8025 Mailpit
- 8333 S3 (SeaweedFS)
- 55532 Postgres

All credentials are dev-only.
