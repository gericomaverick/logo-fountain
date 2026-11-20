#!/bin/sh
# One-shot first-run setup for `docker compose up` (story 1.1a): .env, dependencies, app key, migrations.
set -eu
[ -f .env ] || cp .env.example .env
composer install --no-interaction --no-progress
grep -q '^APP_KEY=base64:' .env || php artisan key:generate --force
# ADR-013: migrations run as the schema owner; the runtime role gets DML via default privileges (postgres init).
php artisan migrate --database=pgsql_migrate --force
