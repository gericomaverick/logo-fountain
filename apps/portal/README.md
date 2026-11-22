# Logo Fountain portal (Laravel)

The client and admin portal, replacing `apps/web` (Next.js). Plan and status: `docs/laravel-migration/`.

```bash
docker compose up -d      # first run: .env, composer install, key, migrations + db:grants (the init service)
                          # roles come from docker/postgres/01-roles.sh on a fresh volume only: after it changes, docker compose down -v
open http://localhost:8080          # app (and /up for the health check)
bin/test                  # Pint, Larastan level 9, Pest
bin/artisan security:check          # no private credential can reach the browser bundle (O-04)
bin/log-grep <logs-dir>   # fail on tokens or signed URLs in logs; --self-test proves the gate
bin/ui-test               # design lint (L7b), ESLint, node:test unit tests, tsc — Node 24 container
bin/browser-test          # Playwright L7/L7a checks against the running stack (PORTAL_HTTP_PORT)
                          #   --update-snapshots after an approved visual change (baselines: tests/browser/__screenshots__)
bin/lighthouse            # NFR-P2 Lighthouse CI against a production build (stop vite, npm run build first)
# Component catalogue (local/testing only): http://localhost:8080/dev/ui
# Media and data components, Tabs, usePolling (story 1.8c): http://localhost:8080/dev/ui/media
# App shells, customer and admin (story 1.9): http://localhost:8080/dev/ui/shells · /dev/ui/shells/admin
```

CI: `.github/workflows/portal.yml` (jobs `laravel-ci` and `audit`; story 1.1b). Images in `compose.yaml` and
`docker/php/Dockerfile` are pinned by tag **and** digest: when bumping a tag, update the digest too
(`docker buildx imagetools inspect <image:tag>`). L3 race tests go in `tests/Concurrency` (testsuite `Concurrency`).

Design tokens live only in `resources/css/app.css` (UX §8). Fonts are self-hosted in `resources/fonts/`. Sfizia is used only through `Components/ui/DisplayTitle.tsx`.

Dev ports bind to 127.0.0.1:
- 8080 app
- 5173 Vite
- 8025 Mailpit
- 8333 S3 (SeaweedFS)
- 55532 Postgres

All credentials are dev-only.
