# Seed scenarios

Logical starting states shared by both seeders: `apps/web/scripts/parity-seed.mjs` (Next, story 0.4) and `php artisan parity:seed` (Laravel, story 2.6). Files describe **facts** (users, projects, statuses, counts), not table rows, so each app maps them to its own schema.

- `entitlements`: `[limit, consumed, reserved]`. `stateHistory` becomes `state_changed` audit events in order.
- IDs are deterministic: UUID derived from `sha256("<scenario>:<kind>:<key>")`, the same in both seeders.
- All passwords are the test-only value in the files. `password: null` means the user has no credential yet (setup flow).
- `admin: true` users are created through the migrate (owner) role, because of the DB admin-flag trigger (A-19).
