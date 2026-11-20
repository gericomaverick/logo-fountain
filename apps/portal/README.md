# Logo Fountain portal (Laravel)

The client and admin portal, replacing `apps/web` (Next.js). Plan and status: `docs/laravel-migration/`.

```bash
docker compose up -d      # first run: .env, composer install, key, migrations (the init service)
open http://localhost:8080          # app (and /up for the health check)
bin/test                  # Pint, Larastan level 9, Pest
bin/ui-test               # design lint (L7b), token unit tests (WCAG contrast), tsc — Node 24 container
bin/browser-test          # Playwright L7/L7a checks against the running stack (PORTAL_HTTP_PORT)
```

Design tokens live only in `resources/css/app.css` (UX §8). Fonts are self-hosted in `resources/fonts/`. Sfizia is used only through `Components/ui/DisplayTitle.tsx`.

Dev ports bind to 127.0.0.1:
- 8080 app
- 5173 Vite
- 8025 Mailpit
- 8333 S3 (SeaweedFS)
- 55532 Postgres

All credentials are dev-only.
