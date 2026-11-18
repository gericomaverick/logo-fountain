# Page objects

Journeys describe *what a person does* (`portal.requestRevision(…)`); page objects know *how* on each app.

- `index.ts` defines the interfaces and picks the implementation for `PARITY_TARGET`.
- `next/` drives the current Next.js app. `laravel/` drives the redesigned Laravel app.
- Prefer accessible locators (`getByRole`, `getByLabel`). Only the Laravel objects may use `data-testid`.
- Journeys must never import from `next/` or `laravel/` directly (`npm run check` enforces this).
