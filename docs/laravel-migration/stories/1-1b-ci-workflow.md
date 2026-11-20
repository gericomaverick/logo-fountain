# Story 1.1b: CI workflow

**Status:** review (2026-11-20; branch `worktree-agent-a83f5b9d94b318c3d`, not merged) · **DoD variant:** Laravel-only · **Epic:** 1 · **Covers:** ADR-028, O-04, NFR-S3 (log grep) · **Gate:** Pest plus the CI jobs run locally · **After:** 1.1a

## Acceptance criteria (epics.md §1.1b)
1. Job `laravel-ci`: Pint, Larastan, Pest including the L3 group.
2. Job `audit`: `composer audit`, `npm audit --omit=dev`, the ported security check.
3. A log grep that fails on token and signed-URL patterns in test logs.
4. (Pin policy, `research-technical.md` §1) every Docker image used by CI is pinned by tag **and** digest.

## Scope
- **In:** `.github/workflows/portal.yml` (`laravel-ci`, `audit`); `bin/log-grep`; `security:check` (full port, not a stub); the `Concurrency` testsuite; digests for every image in the portal and parity stacks.
- **Out:**
  - the `parity` matrix `laravel` target (ADR-028). Deferred to the first Conversion story (1.4): it needs a Laravel stack runner for `tests/parity`, and no Laravel endpoint exists yet. Recorded in `parity.yml`'s header.
  - the `ui` job (Vitest, tsc, ESLint, design lint, L7/L7a). That's for 1.7 or later, once there's UI code.
  - log-grepping the Next parity job's logs.

## Inventory scope
O-04 (security check and predeploy check): the security-check half is done here. The predeploy half (lint and typecheck before deploy) belongs to the deploy story. X-14 / NFR-S3: the CI-grep half is done here; the log and audit scrubbers are 1.6.

## Next.js source read
`apps/web/scripts/security-check.mjs`, `apps/web/package.json` (`security:check`, `predeploy:check`), `.github/workflows/parity.yml`. Docs read: RESUME, handoff, epics §1.1b plus the DoD variants, ADR-028, architecture §4.6 and the ADR table, `02-test-strategy.md` (layers and CI), `research-technical.md` §1 (pin policy), `brownfield/data-model-and-ops.md` (row for security-check), `brownfield/auth-and-security.md` (link token shapes), and the 1.1a story record.

## Behaviour notes
`security-check.mjs` (Next), with exit 1 and a `- file: issue` list on failure:
1. In `.env`, `.env.local` and `.env.example`, a `NEXT_PUBLIC_*` name containing `SERVICE_ROLE` is forbidden.
2. A `NEXT_PUBLIC_*` value equal to the value of a private key fails. The private keys are `BETTER_AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `R2_SECRET_ACCESS_KEY`, `POSTMARK_SERVER_TOKEN` and `STRIPE_SECRET_KEY`.
3. In `src/**/*.{ts,tsx,js,mjs,cjs}`, a `"use client"` file importing server auth or Prisma modules fails.
4. Any `process.env.NEXT_PUBLIC_<private key>` reference fails.

The intent: no private credential can reach the browser bundle.

Link tokens travel in URL fragments (`#token=…&next=…`; `auth-and-security.md` §2). That shape is the main thing the log grep has to catch.

## Laravel implementation
| Piece | Where |
|---|---|
| Workflow: `laravel-ci` (stack, Pint, Larastan, Pest L1/L2, Pest L3, collect logs, log grep, stack logs on failure) | `.github/workflows/portal.yml:29-68` |
| Workflow: `audit` (composer audit, npm audit, security check) | `.github/workflows/portal.yml:70-88` |
| L3 group: the `Concurrency` testsuite, plus Pest extension | `apps/portal/phpunit.xml:14-17`, `apps/portal/tests/Concurrency/.gitkeep`, `apps/portal/tests/Pest.php:5` |
| L3 step runs when `tests/Concurrency/*Test.php` exists. Pest exits 1 on an empty suite, so the step skips it with a message instead | `.github/workflows/portal.yml:47-53` |
| Security check port (`php artisan security:check [--path=]`) | `apps/portal/app/Console/Commands/SecurityCheck.php` |
| Log grep: 11 named ERE patterns. Prints `file:line: pattern-name` only, never the match; `--self-test` | `apps/portal/bin/log-grep` |
| Tests no longer need Vite (`withoutVite()`) | `apps/portal/tests/TestCase.php` |
| Digest pins | `apps/portal/compose.yaml` (postgres, nginx, node, mailpit, seaweedfs), `apps/portal/docker/php/Dockerfile:2,6` (php, composer), `tests/parity/infra/docker-compose.test.yml` (postgres, mailpit, seaweedfs, node ×2) |
| GitHub action pinned by commit SHA | `actions/checkout@11d5960…` (v4.4.0) in `portal.yml` |

The workflow runs the app's own `compose.yaml`: postgres, mailpit, seaweedfs, app and worker, as ADR-028 lists. There's no PHP on the runner. The runner's UID/GID are passed via `GITHUB_ENV`, so the bind-mounted `vendor/` is writable. `shell: bash` gives `-eo pipefail`, so `pest | tee` fails when Pest fails.

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Public env prefix | `NEXT_PUBLIC_*` | `VITE_*` (Vite's `envPrefix`) | Framework | n/a |
| Forbidden public names | contains `SERVICE_ROLE` | contains `SECRET`, `PASSWORD`, `PRIVATE`, `SERVICE_ROLE` or `TOKEN` | Stricter. A Supabase-only rule is too narrow for the new stack | proposed D (below) |
| Private-value copy | equal value | equal value **or** `${PRIVATE}` interpolation (Laravel's dotenv interpolates; `VITE_APP_NAME="${APP_NAME}"` is the skeleton pattern) | New leak path in Laravel | proposed D |
| Client imports server code | checked | not applicable (Inertia pages can't import PHP) | Framework | n/a |
| Widened `envPrefix` in `vite.config.*` | n/a | fails unless exactly `'VITE_'` | Widening it would publish every matching variable | proposed D |
| Private key list | 6 Next names | `APP_KEY`, `DB_PASSWORD`, `DB_MIGRATE_PASSWORD`, `AWS_SECRET_ACCESS_KEY`, `MAIL_PASSWORD`, `POSTMARK_TOKEN`, `POSTMARK_API_KEY`, `STRIPE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (`SecurityCheck::PRIVATE_KEYS`) | Laravel names. Stories that add secrets extend the list | n/a |

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 Pest | `tests/Feature/SecurityCheckTest.php` (10 cases): passes on the real app and on a clean project; rejects a secret-looking VITE name, a copied private value, a `${APP_KEY}` interpolation, frontend `import.meta.env` reads (3 datasets) and a widened envPrefix; allows an explicit `'VITE_'` | O-04 |
| CI self-test | `bin/log-grep --self-test`: clean logs pass, and each of 11 planted secrets fails on its own. Runs in every `laravel-ci` job | X-14 / NFR-S3 |

Test-port ledger rows resolved: none. (`security-check.mjs` has no Vitest file.)

## Test evidence
All commands were run with `COMPOSE_PROJECT_NAME=lf-1-1b PORTAL_HTTP_PORT=18081 PORTAL_PG_PORT=55511 PORTAL_VITE_PORT=15171 PORTAL_MAIL_PORT=18021 PORTAL_S3_PORT=18331`, on Docker Compose v5.0.2.

- **YAML:** `python3 yaml.safe_load` on `portal.yml`, `parity.yml`, `apps/portal/compose.yaml` and the parity compose file parses OK. `rhysd/actionlint:1.7.7 -no-color` (with its bundled shellcheck) exits 0, on both workflows. `koalaman/shellcheck:v0.10.0 bin/log-grep` exits 0.
- **Every job's commands, executed:** a scratchpad runner (`run-job.py`) executes each `run:` step of a job exactly as written. It uses `bash --noprofile --norc -eo pipefail`, the `defaults.run.working-directory`, the workflow `env` and `GITHUB_ENV`, and honours `if: always()` / `failure()`. `uses:` steps are skipped. The worktree was first reset to fresh-clone state (`git clean -fdX apps/portal`: no `vendor`, no `.env`).
  - `laravel-ci`: **PASSED**. Pint 31 files pass. Larastan level 9 "No errors". Pest Unit+Feature **15 passed (31 assertions)**. L3 skipped (empty, with a message). Log grep self-test passed; logs clean. The "stack logs on failure" step was skipped.
  - `audit` (fresh again after `down -v` and `git clean -fdX`): **PASSED**. `composer audit --locked`: "No security vulnerability advisories found". `npm audit --omit=dev`: "found 0 vulnerabilities". `security:check`: passed.
- **The log grep fails on a planted token and passes on clean logs:**
  - `bin/log-grep <ci-logs>` on clean logs: exit 0.
  - Then a `#token=` link was appended to `compose.log` and `X-Amz-Signature=` to `pest.log`: exit 1, printing 2 hits as `file:line: pattern` with no secret text.
  - End to end: a temporary Pest test (not committed) logged a fake magic link via `Log::info`, plus a temporary `tests/Concurrency/ProbeTest.php`. Job result: Pest L1/L2 16 passed; **L3 step ran: 1 passed**. The log grep found `laravel.log:1: auth-link-token` and exited 1, failing the job. "Stack logs on failure" was correctly **skipped**, because the grep failed. The planted value doesn't appear in the job output.
  - Failure path: an earlier run failed at Pint, on the temporary file's style. The later steps were skipped, `always()` steps ran, the grep was clean, and the "stack logs on failure" step ran.
- **The security check fails on a planted leak (real command):** appending `VITE_STRIPE_SECRET="${STRIPE_SECRET}"` to `.env.example` gave exit 1 with 2 issues (forbidden name, and it references a private value). Reverted.
- **Parity stack with digests:** `docker compose -f tests/parity/infra/docker-compose.test.yml config --images` lists all 5 pinned refs. `pull -q` exits 0.
- **Teardown:** `docker compose down -v` (project `lf-1-1b` only).

**Not run, and why:**
- GitHub Actions itself: no `gh` and no `act` here. The first real run must be checked on the repo's Actions tab after the merge.
- The full Next parity suite with the newly digest-pinned parity images: it takes about 12 minutes on the shared parity ports while 4 other agents run. The digests are what the tags resolve to today, and `config`/`pull` succeed. The `parity` job on the first push after the merge verifies it.
- The parity `laravel` target and the `ui` job: out of scope (see Scope).

## Gotchas
- **Pest exits 1 on an empty testsuite** ("No tests found"), so `--testsuite=Concurrency` can't run unconditionally until the first L3 test lands. The CI step checks for `*Test.php` first. *(Promote to AGENTS.md.)*
- **`HealthTest` needed a running Vite dev server** (`public/hot`). Without Vite, `@vite` throws `ViteManifestNotFoundException` and `/` returns 500. 1.1a only passed because the dev stack starts `vite`. Fixed with `withoutVite()` in `tests/TestCase.php`. *(Promote to AGENTS.md: Pest must not depend on Vite.)*
- **The log grep must never print what it matched.** CI logs are readable by anyone with repo access. The script prints `file:line: pattern-name`. For the same reason, the workflow prints the stack logs on failure only after the grep passed. *(Promote.)*
- **Planted secrets in the self-test are split with `@`** (stripped at runtime), so the script itself doesn't trip GitHub secret scanning or push protection.
- **Floating tags hid drift:**
  - `node:24-bookworm-slim` resolves to 24.22.3, while parity uses 24.22.2;
  - `nginx:1.28-alpine` → 1.28.3;
  - `composer:2.11` → 2.11.2.

  The pins now name the exact patch tag plus its digest, matching what 1.1a was tested on.
- `bash` doesn't export `UID`, and there's no `GID` variable at all. Compose fell back to 1000:1000, which would break the bind mount on GitHub runners (uid 1001). The workflow writes both to `GITHUB_ENV`.
- The shared `lf-portal-php:dev` image tag is rebuilt by every compose project (parallel agents included). That's harmless while the Dockerfiles match, but a parallel agent changing the Dockerfile would race. Consider `image: ${COMPOSE_PROJECT_NAME:-lf-portal}-php:dev`.

## Docs updated
- `apps/portal/README.md` (CI, `security:check`, `log-grep`, digest bump rule, `tests/Concurrency`).
- `.github/workflows/parity.yml` header comment (the deferred `laravel` job).
- Not touched, per instructions (the parent merges): handoff, sprint-status, the inventory (O-04 → security check done; predeploy part pending), AGENTS.md, DECISIONS/RISKS/ASSUMPTIONS.

## Decisions for the parent to log (DECISIONS.md)
- D: The ported security check is stricter than Next. VITE_ names containing SECRET, PASSWORD, PRIVATE, SERVICE_ROLE or TOKEN fail; `${PRIVATE}` interpolation fails; a widened Vite `envPrefix` fails (`SecurityCheck.php`).
- D: CI images are pinned to **exact patch tag + digest**, in `compose.yaml`, the Dockerfile and the parity compose file. Dev uses the same pins, so dev, CI and parity can't drift. A tag bump means updating the digest too.
- D: GitHub Actions are pinned by commit SHA, with a version comment (`portal.yml`). `parity.yml` still uses `@v4` tags; align it in a later touch.
- D: The parity `laravel` target moves from 1.1b to 1.4 (the first Conversion story).
- D: L3 lives in the `Concurrency` PHPUnit testsuite (`tests/Concurrency`), run serially after L1/L2.
- D: The log grep runs in `laravel-ci` (where the logs are), not in `audit`. That differs from the `02-test-strategy.md` line 90 grouping.

## Risks for the parent to log (RISKS.md)
- R: The pins are younger than the 3-week rule (composer 2.11.2 is from 2026-11-10; nginx 1.28.3 and node 24.22.3 are recent). They're exactly what 1.1a was already running on floating tags. Likelihood low, impact low. Mitigation: Renovate/Dependabot digest updates with a 14-day minimum age.
- R: The log grep is pattern-based, so a new token format won't be caught until a pattern is added. Mitigation: stories adding a token or URL format add a pattern plus a self-test line (`bin/log-grep`), and 1.6 adds the scrubber.
- R: The workflow hasn't run on GitHub yet. Mitigation: check the first run after the merge.
- R: The shared `lf-portal-php:dev` tag across parallel compose projects (see Gotchas).

## Promote to apps/portal/AGENTS.md (story 1.2)
- Pest must not depend on Vite: keep `withoutVite()` in `TestCase`.
- L3 tests go in `tests/Concurrency`, named `*Test.php`.
- When adding a secret env var, add it to `SecurityCheck::PRIVATE_KEYS`. When adding a token or URL format, add a `bin/log-grep` pattern plus a self-test line.
- When bumping an image tag, update the digest too (`docker buildx imagetools inspect <image:tag>`).

## Open items
- Check the first GitHub run of `portal.yml`, and of `parity.yml` with the digest-pinned images. Owner: the parent, after the merge.
- The parity `laravel` job plus a Laravel stack runner: story 1.4.
- The `ui` job: story 1.7 or the first UI story.
- O-04 predeploy check (lint and typecheck before deploy): the deploy story.
- Renovate/Dependabot for digest and SHA updates (the pin policy): an ops story.
- Optional: per-project PHP image tag (see Gotchas). Owner: the parent, or 1.2.
