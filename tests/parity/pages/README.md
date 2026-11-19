# Page objects

Journeys describe *what a person does* (`portal.requestRevision(…)`); page objects know *how* on each app.

- `index.ts` defines the interfaces and picks the implementation for `PARITY_TARGET`. Interfaces must be expressible on the redesigned Laravel IA too (`ux-design.md` §5): `portal.openProject()` works whether the person sees a list or lands on their only project.
- `next/` drives the current Next.js app. `laravel/` drives the redesigned Laravel app (typed stubs that throw "not implemented (story X.Y)" until the screen exists).
- `stripe-fake.ts` drives the fake hosted checkout page (shared test infra, the same on both targets).
- Prefer accessible locators (`getByRole`, `getByLabel`). Only the Laravel objects may use `data-testid`.
- Next under `next dev` may full-reload a freshly compiled page after first paint; `next/auth.ts` `attempt()` retries a screen action from the top. Use it for new form actions.
- Journeys must never import from `next/` or `laravel/` directly (`npm run check` enforces this).
