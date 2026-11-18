---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - docs/laravel-migration/00-migration-plan.md
  - docs/laravel-migration/brownfield/index.md
  - docs/laravel-migration/brownfield/auth-and-security.md
  - docs/laravel-migration/brownfield/checkout-and-payments.md
  - docs/laravel-migration/brownfield/storage-and-uploads.md
  - docs/laravel-migration/brownfield/data-model-and-ops.md
  - docs/laravel-migration/02-test-strategy.md
  - docs/laravel-migration/01-feature-inventory.md (X-series rows)
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Laravel target stack for the Logo Fountain portal migration (apps/web -> apps/portal)'
research_goals: 'Evidence for every row of plan section 3; exact version pins; hosting choice on Hetzner; risks and owner questions before PRD and architecture'
user_name: 'Logo Fountain owner'
date: '2026-11-18'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-11-18
**Author:** BMAD technical-research workflow (step 1.2), run autonomously for the Logo Fountain owner
**Research Type:** technical
**Output for:** plan step 1.2 gate ("every §3 row has evidence"), then PRD (2.1) and architecture/ADRs (3.1)

---

## Executive summary

The stack in plan §3 holds up. Nothing in it needs to be thrown out. Two rows change, one row is refined, and hosting is the only decision the owner still has to make.

- **Framework:** Laravel **13** (13.0 released 2026-03-17, security fixes until 2028-03-17) on **PHP 8.5**. PHP 8.4 is the real floor, because Pest 5 and `symfony/postmark-mailer` 8.x both require it. A **critical PHP security release is scheduled for 2026-11-19**, so the PHP pin has to be the patch released that day or later.
- **UI:** Inertia **v3** (server `inertiajs/inertia-laravel` 3.x, client `@inertiajs/react` 3.x) requires **React 19**, has dropped Axios, and handles the XSRF header itself. No SSR is needed.
- **CHANGED, rate limiting:** don't use Laravel's `RateLimiter` for the auth buckets. Port the existing single-table Postgres limiter as one atomic `INSERT … ON CONFLICT … RETURNING` statement, and run it **outside** any transaction. Laravel's database cache store increments with `SELECT … FOR UPDATE` inside a transaction on the default connection. If that ran inside the credential fence it would roll back with it, so failed logins would stop counting.
- **CHANGED, S3 stand-in for local and CI:** **not MinIO.** The `minio/minio` GitHub repo was **archived on 2026-04-25**, its last release is from 2025-10-15, and the latest release no longer links published binaries or Docker images. Use **SeaweedFS**, which documents atomic `If-None-Match: *` create-only PUTs, and prove it with an E0 probe test.
- **REFINED, email:** lifecycle emails become queued `afterCommit` mailables (F-8). The **auth link emails must stay synchronous after commit**, because the contract is "if the send fails, delete the proof and return an error". A queued mail can't do that.
- **Stripe:** keep API version `2026-02-25.clover`. It exists: `stripe-php` 19.4.0 pinned it on 2026-02-25. Set it explicitly through the `stripe_version` client option on a current `stripe-php` major (22.x). Stripe documents that PHP, unlike typed SDKs, can target a different API version.
- **R2:** the AWS SDK for PHP models `IfNoneMatch` on `PutObject` as the `If-None-Match` header, and R2 documents atomic create-only semantics (`412 PreconditionFailed`). Set `request_checksum_calculation` and `response_checksum_validation` to `when_required`. The SDK has computed CRC32 by default since 3.337.0.
- **Hosting (OPEN):** the recommendation is **Laravel Forge provisioning a Hetzner Cloud server**, with PostgreSQL 18 on the same box at launch, a Hetzner Cloud Firewall in front, and **pgBackRest** sending encrypted backups off-box to R2 (plus a Hetzner Storage Box copy), with a restore drill as a release gate. Forge's automatic security updates **don't patch PHP** (Forge's own advisory says so), so PHP patching has to be an explicit runbook step whichever tool is used.

---

## Table of contents

1. Scope and methodology
2. Pinned versions
3. Technology stack analysis
4. Integration patterns
5. Architectural patterns
6. Implementation research (testing, CI, hosting, operations, security tooling)
7. Synthesis: plan §3 row-by-row verdicts
8. Risks found
9. Questions for the owner
10. Sources

---

## 1. Scope and methodology

### Scope (confirmed against the plan; no interactive menu was used)

In scope: the runtime and tooling choices behind plan §3, the 12 research questions in the step 1.2 brief, and the hosting choice left open by owner decision D5. Out of scope: anything that reopens D1–D8 (Laravel; Inertia + React + TS + Tailwind 4; PostgreSQL; fresh install; launch directly on Laravel; Hetzner; Docker for local, parity and CI; snake_case; R2; Stripe Checkout one-off payments; Postmark; full redesign), and all visual or UX design.

### Method

- Every version and release date was read on 2026-11-18 from a primary source: php.net, laravel.com docs, GitHub releases and source, the Packagist `p2` metadata API, the npm registry, the Docker Hub API, Stripe docs and the `stripe-php` CHANGELOG, Cloudflare R2 docs, AWS SDK docs and source, and Hetzner, Forge, Ploi, Mailpit, SeaweedFS, pgBackRest and PostgreSQL docs.
- Framework behaviour was checked in **Laravel 13.x source** where the docs are silent: `DatabaseStore`, `RateLimiter`, `ConcurrencyErrorDetector`, `ManagesTransactions`, `DatabaseQueue`, `HasUuids`, `BcryptHasher`, `DatabaseSessionHandler` and `PreventRequestForgery`.
- **Pin policy (recommended for ADR-001):** an initial pin must be at least about 3 weeks old (released on or before 2026-10-28). After that, Renovate or Dependabot run with a minimum release age of 14 days, **except security advisories, which are taken immediately**. Composer uses caret constraints plus a committed `composer.lock`. npm uses exact versions plus `package-lock.json`. Docker images are pinned by tag **and digest** in CI.
- Anything that couldn't be verified is marked **UNVERIFIED**.

---

## 2. Pinned versions

"Recommended pin" follows the pin policy. "Latest observed" is what the source showed on 2026-11-18.

| Component | Recommended pin | Pin release date | Latest observed (date) | Source |
|---|---|---|---|---|
| PHP | **8.5**, at least **8.5.13** (the 2026-11-19 security release). 8.5.12 is the current stable | 8.5.12: 2026-10-21 | 8.5.12 (2026-10-21). 8.6.0 is still RC7 (GA planned 2026-11-19, too new) | https://www.php.net/ , https://www.php.net/supported-versions.php (8.5 active support to 2027-12-31, security support to 2029-12-31) |
| Laravel framework | `laravel/framework ^13.39` | v13.39.0: 2026-10-27 | v13.43.0 (2026-11-17) | https://repo.packagist.org/p2/laravel/framework.json , https://laravel.com/docs/13.x/releases (13.x released 2026-03-17, bug fixes to Q3 2027, security fixes to 2028-03-17, PHP 8.3–8.5) |
| Laravel skeleton | `laravel/laravel` v13.11.0 (for `composer create-project`) | 2026-09-30 | v13.11.0 | https://repo.packagist.org/p2/laravel/laravel.json |
| Inertia server adapter | `inertiajs/inertia-laravel ^3.7` (from 2026-11-23). Fallback 3.5.2 | 3.7.0: 2026-11-02. 3.5.2: 2026-10-21 | v3.7.0 (2026-11-02). Requires PHP ^8.2 and Laravel ^11.35, ^12 or ^13 | https://repo.packagist.org/p2/inertiajs/inertia-laravel.json , https://github.com/inertiajs/inertia-laravel/releases |
| Inertia React adapter | `@inertiajs/react 3.11.0` (from 2026-11-23, released alongside server 3.7.0). Fallback 3.9.1 | 3.11.0: 2026-11-02. 3.9.1: 2026-10-09 | 3.11.0. Peers: react ^19, react-dom ^19 | https://registry.npmjs.org/@inertiajs/react , https://github.com/inertiajs/inertia/releases |
| React / React DOM | 19.3.1 | 2026-10-14 | 19.3.1 | https://registry.npmjs.org/react |
| Vite | 8.3.5 | 2026-10-21 | 8.3.8 (2026-11-11) | https://registry.npmjs.org/vite |
| laravel-vite-plugin | 3.2.0 (peer: vite ^8) | 2026-08-11 | 3.2.1 (2026-11-04) | https://registry.npmjs.org/laravel-vite-plugin |
| @vitejs/plugin-react | 6.1.2 | 2026-10-05 | 6.3.0 (2026-11-09) | https://registry.npmjs.org/@vitejs/plugin-react |
| Tailwind CSS + `@tailwindcss/vite` | 4.3.3 (move to the 4.3.5 patch after 2026-11-27) | 2026-07-16 | 4.3.5 (2026-11-06) | https://registry.npmjs.org/tailwindcss , https://registry.npmjs.org/@tailwindcss/vite |
| TypeScript | **6.0.3** (OPEN: 7.x in an E1 spike) | 2026-04-16 | 7.0.2 (2026-07-08) | https://registry.npmjs.org/typescript |
| Node.js (build and tooling) | 24 LTS "Krypton" (patch floats, currently 24.22.3) | 24.22.3: 2026-11-10 | 26.13.1 LTS "Lithium" | https://nodejs.org/dist/index.json |
| PostgreSQL | **18** (18.7). Docker `postgres:18.7` | 18.0: 2025-09-25. 18.7 image: 2026-11-15 | 18.7. EOL 2030-11-14 | https://www.postgresql.org/support/versioning/ , Docker Hub `library/postgres` |
| Stripe PHP SDK | `stripe/stripe-php ^22.1` | 22.1.0: 2026-10-29 (pins API `2026-10-28.endive`) | 23.0.0 (2026-11-11, breaking: API keys no longer survive PHP serialisation, and `StripeClient` no longer inherits the global account) | https://raw.githubusercontent.com/stripe/stripe-php/master/CHANGELOG.md , https://repo.packagist.org/p2/stripe/stripe-php.json |
| Stripe API version | **`2026-02-25.clover`** (exists; set explicitly via `stripe_version`) | 2026-02-25 (pinned by stripe-php 19.4.0) | Latest GA `2026-10-28.endive` | stripe-php CHANGELOG (19.4.0 entry), https://docs.stripe.com/sdks/set-version?lang=php |
| AWS SDK for PHP | `aws/aws-sdk-php ^3.402` (released daily, so weekly updates) | 3.402.3: 2026-10-28 | 3.405.0 (2026-11-18). Requires PHP >=8.2 | https://repo.packagist.org/p2/aws/aws-sdk-php.json |
| Postmark transport | `symfony/postmark-mailer ^8.1` (8.1.6) + `symfony/http-client ^8.1` | 8.1.6: 2026-08-30 | 8.1.6. **Requires PHP >= 8.4.1** | https://repo.packagist.org/p2/symfony/postmark-mailer.json , https://laravel.com/docs/13.x/mail |
| Pest | `pestphp/pest ^5.3` (5.3.4) | 5.3.4: 2026-10-27 | 5.3.7 (2026-11-16). **Requires PHP ^8.4** | https://repo.packagist.org/p2/pestphp/pest.json , https://pestphp.com/docs/installation |
| Pest Laravel plugin | `pestphp/pest-plugin-laravel ^5.0` (5.0.1). Requires laravel/framework ^13.23 | 2026-07-29 | 5.0.1 | https://repo.packagist.org/p2/pestphp/pest-plugin-laravel.json |
| ParaTest (parallel) | `brianium/paratest ^7.27` (7.27.4) | 2026-10-22 | n/a | https://repo.packagist.org/p2/brianium/paratest.json , https://laravel.com/docs/13.x/testing |
| Larastan / PHPStan | `larastan/larastan ^3.13` (3.13.2). PHPStan 2.x (level 10 is the maximum) | 3.13.2: 2026-10-23 | Larastan 3.15.0 (2026-11-11), PHPStan 2.3.6 (2026-11-15) | https://repo.packagist.org/p2/larastan/larastan.json , https://github.com/larastan/larastan |
| Pint | `laravel/pint ^1.32` (1.32.1) | 2026-09-10 | 1.32.3 (2026-11-11) | https://repo.packagist.org/p2/laravel/pint.json |
| CSP middleware | `spatie/laravel-csp ^3.30` (3.30.1). Maintained; supports report-only policies | 2026-10-26 | 3.31.1 (2026-11-06) | https://repo.packagist.org/p2/spatie/laravel-csp.json , https://github.com/spatie/laravel-csp/blob/main/config/csp.php |
| Composer (for `composer audit`) | 2.11.x (2.11.1) | 2026-10-30 | 2.11.2 (2026-11-10) | https://getcomposer.org/versions |
| Playwright | `@playwright/test 1.64.1` | 2026-10-14 | 1.65.1 (2026-11-13) | https://registry.npmjs.org/@playwright/test |
| axe for Playwright | `@axe-core/playwright 4.14.0` | 2026-10-15 | 4.14.0 (axe-core 4.14.1, 2026-11-16) | https://registry.npmjs.org/@axe-core/playwright |
| Mailpit (test SMTP) | `axllent/mailpit:v1.33.0` | 2026-10-31 | v1.34.0 (2026-11-17) | https://github.com/axllent/mailpit/releases , Docker Hub `axllent/mailpit` |
| S3 stand-in (local and CI) | **SeaweedFS 4.51** (`chrislusf/seaweedfs`) | 2026-10-25 | 4.54 (2026-11-16) | https://github.com/seaweedfs/seaweedfs/releases , https://github.com/seaweedfs/seaweedfs/wiki/S3-Conditional-Operations |
| MinIO (rejected) | n/a | last release RELEASE.2025-10-15T17-29-55Z | Repo **archived 2026-04-25** | https://github.com/minio/minio/releases |
| Backups | pgBackRest 2.60.0 | 2026-10-18 | 2.60.1 (2026-11-16) | https://github.com/pgbackrest/pgbackrest/releases , https://pgbackrest.org/configuration.html |
| Forge (if chosen) | Hobby $12/mo (1 external server) or Growth $19/mo (unlimited servers) | pricing page as of 2026-11-18 | n/a | https://laravel.com/forge/pricing |
| Ploi (alternative) | Pro €13/mo (zero-downtime and DB backups need Pro) | pricing page as of 2026-11-18 | n/a | https://ploi.io/pricing |
| Coolify (option c only) | v4.7.x | v4.7.5: 2026-11-10 | v4.7.5 | https://github.com/coollabsio/coolify/releases |
| Caddy (option d only) | 2.11.7 | 2026-10-03 | 2.11.9 (2026-11-05) | https://github.com/caddyserver/caddy/releases |

**Not used (checked so the decision is on record):** Laravel Horizon 5.52.0 (Redis-only). Laravel Cashier 16.11.0 (billing). Laravel Fortify 1.43.0 and Breeze 2.4.2 (Breeze and Jetstream "will no longer receive additional updates" since the Laravel 12 starter kits: https://laravel.com/docs/master/releases). Enlightn 2.10.0 (last release 2024-04-05, supports Laravel ≤ 11, **GitHub repo archived**). `enlightn/security-checker` 2.0.0 (2023-12-10).

**UNVERIFIED:** PHP 8.5.13 doesn't exist yet. php.net announces a critical security release for 2026-11-19 14:00–14:30 UTC, and the pin must be that release or later.

---

## 3. Technology stack analysis

### 3.1 Language: PHP

- Supported branches (https://www.php.net/supported-versions.php): 8.2 (security only, EOL 2026-12-31), 8.3 (security to 2027-12-31), 8.4 (active to 2026-12-31, security to 2028-12-31), **8.5 (active to 2027-12-31, security to 2029-12-31)**. 8.6 is at RC7.
- On 2026-10-21, PHP 8.5.12, 8.4.27, 8.3.36 and 8.2.35 fixed CVE-2026-109618 and CVE-2026-109619, both critical and enabling unauthenticated remote code execution. Another critical release is scheduled for 2026-11-19 (https://www.php.net/).
- Floor constraints: Laravel 13 needs ^8.3. **Pest 5 needs ^8.4. symfony/postmark-mailer 8.x needs >=8.4.1.** Stripe-php supports 7.4+.
- **Recommendation: PHP 8.5** (the newest stable branch, with the longest support window, and supported by Laravel 13). Don't adopt 8.6 at launch: Laravel 13 lists PHP 8.3–8.5.

### 3.2 Framework: Laravel 13

- Support table (https://laravel.com/docs/13.x/releases): Laravel 13 was released 2026-03-17, gets bug fixes until Q3 2027 and security fixes until 2028-03-17. Laravel 12 gets security fixes only until 2027-02-24. **Laravel 14 is expected around Q1 2027.** Plan one upgrade story after launch (the risk is listed in section 8).
- Laravel 13 features that matter here:
  - `PreventRequestForgery`, an origin-aware CSRF check (`Sec-Fetch-Site`) with a token fallback (§4.4).
  - `HasUuids` generates **UUIDv7** (`Str::uuid7()`, read in source).
  - Database is the default session, cache and queue driver.
  - `config/session.php` has `'serialization' => 'json'` by default (avoids PHP "gadget chain" deserialisation if `APP_KEY` leaks).
  - Queue job attributes such as `#[Tries]`, `#[Backoff]` and `#[Timeout]`.
- Laravel 13 supports PostgreSQL 10.0+ (https://laravel.com/docs/13.x/database).

### 3.3 Front end: Inertia v3, React 19, Vite 8, Tailwind 4

- Inertia v3 upgrade guide (https://inertiajs.com/docs/v3/getting-started/upgrade-guide): the server adapter needs PHP 8.2+ and Laravel 11+. **The React adapter requires React 19+.** Axios is no longer bundled (Inertia has a built-in XHR client). `@inertiajs/vite` is optional.
- Security-relevant fixes to have:
  - inertia-laravel 3.3.4 "escapes HTML tags in the initial page JSON".
  - @inertiajs/react 3.7.1 "escapes `<` in the initial page JSON".
  - 3.9.1 "sends the XSRF token header only to same-origin URLs" and "uses a unique IV for every encrypted history entry" (https://github.com/inertiajs/inertia/releases).
  - Every pin in section 2 includes these.
- The Laravel 13 skeleton already ships `vite ^8`, `laravel-vite-plugin ^3.1`, `tailwindcss ^4` and `@tailwindcss/vite ^4` (https://raw.githubusercontent.com/laravel/laravel/13.x/package.json). Tailwind 4 is set up through the Vite plugin, with no PostCSS config. `apps/web` currently uses `@tailwindcss/postcss`, but the redesign rebuilds the CSS anyway.
- **SSR: not needed.** The portal is noindex and behind authentication, so SSR adds a Node process to run and patch for no gain. Inertia v3 supports turning SSR off per route if a public page ever needs it.
- TypeScript: `apps/web` is on `^5`. The current major is 7.0.2 (a native compiler). **Recommendation: TypeScript 6.0.3** for the ported modules, with an E1 spike to try 7.x. Whether ESLint, typescript-eslint and the Vite toolchain support TS 7 is **UNVERIFIED**.

### 3.4 Database: PostgreSQL 18

- 18.7 is the current minor and is supported until 2030-11-14 (https://www.postgresql.org/support/versioning/). PG 14 reaches EOL on 2026-11-12, so it's already out.
- **There's no first-party managed PostgreSQL for Hetzner Cloud** that I could find (2026-11-18). Third-party comparisons say so (https://encore.dev/articles/hetzner-vs-digitalocean), and so do third-party managed offerings that run on Hetzner, such as Ubicloud. Hetzner's separate *Managed Server / webhosting* line does run PostgreSQL (https://docs.hetzner.com/managed/general/softwareupdates/), but it isn't a fit for a Laravel app with two roles and triggers. This is partly **UNVERIFIED**: no Hetzner product page states "no managed Postgres". So Postgres is self-managed, as D5 expected.

### 3.5 Storage: Cloudflare R2 through the AWS SDK for PHP v3

Covered in §4.3.

### 3.6 Email: Postmark through Symfony Mailer

Covered in §4.5.

---

## 4. Integration patterns

### 4.1 JSON API under Inertia

- Keep `/api/*` paths, methods, codes and the `{error:{message,code?,details?}}` shape byte for byte (brownfield "Notes for architecture" 1).
- **Routing consequence:** cookie-authenticated `/api/*` endpoints must run in the **`web` middleware group**, which provides session, cookies and encryption. Laravel's `routes/api.php` group is stateless by default. Put them in `routes/web.php` under an `api` prefix, or in a custom group that includes `StartSession`.
- Inertia page visits (GET) carry props. Mutations stay as `fetch` calls to `/api/*` from the reused TS modules, which keeps the parity contract suite meaningful for both apps.

### 4.2 Stripe (Checkout Sessions and webhook)

- **API version:** `2026-02-25.clover` exists. `stripe-php` 19.4.0 (2026-02-25) "changes the pinned API version to `2026-02-25.clover`". The naming is `YYYY-MM-DD.<release>`, with releases acacia → basil → clover → dahlia → endive (CHANGELOG).
- **How to pin it:** every SDK version uses the API version that was current at its release. For PHP, Stripe documents overriding it per client: `new \Stripe\StripeClient(['api_key' => …, 'stripe_version' => '2026-02-25.clover'])`. Response objects then come back in that version (https://docs.stripe.com/sdks/set-version?lang=php). Stripe warns against this only for strongly typed SDKs (Java, Go, .NET).
- **Why not pin an old SDK instead:** "Older major versions … won't receive any additional updates" (https://docs.stripe.com/sdks/versioning?lang=php). So use the current major with the version override.
- **SDK major:** take **22.x** now. 23.0.0 (2026-11-11) has breaking changes (API keys are no longer kept through native PHP serialisation, and `StripeClient` no longer inherits `Stripe::setAccountId`). Neither affects a non-Connect, non-serialised client, but it's one week old.
- **Webhook events** are rendered in the **endpoint's** API version, or the account default at event time. So the live webhook endpoint must be registered with `2026-02-25.clover` as well (an owner release-gate item). The local fixture signer is unaffected.
- Upgrading off clover (dahlia and endive changed, for example, `ui_mode` enum values: the current reference shows the default `hosted_page`) is a **separate ADR after parity**, never part of the port.
- **Webhook verification in PHP:** `\Stripe\Webhook::constructEvent($request->getContent(), $request->header('Stripe-Signature'), $secret)`, with a default tolerance of **300 s** (`Webhook::DEFAULT_TOLERANCE`, read in source). Use the **raw body** (`$request->getContent()`). Laravel's `TrimStrings` and `ConvertEmptyStringsToNull` only touch parsed input, not the raw content.
  - stripe-php 20.0.0 "throws an error when using the wrong webhook parsing method". Use `constructEvent` (snapshot events), not `parseEventNotification` (thin events).
  - stripe-php 22.1.0 rejects whitespace-only webhook secrets.
  - Exclude the route from CSRF and from the Origin guard. Stripe docs recommend exempting it from CSRF.
  - The parity fixture signer must sign with a current timestamp because of the tolerance.
- **`allow_promotion_codes` (F-1):** a plain boolean on Checkout Session create (https://docs.stripe.com/api/checkout/sessions/create).
  - The reference states **no incompatibility** with `custom_fields` (up to 3 fields; we use 2) or `invoice_creation` (payment mode).
  - It does note that with no Customer created, "promotion codes limited to first time customers will return invalid". We use `customer_creation=always`, so first-time-customer promotions such as `PRO40FIRST5` work as intended.
  - We never send `discounts`. (It's widely documented that `discounts` and `allow_promotion_codes` are mutually exclusive, but that wasn't restated on the fetched page: **UNVERIFIED**, and moot here.)
  - Promotion codes change `amount_total`. Fulfilment already stores `amount_total`, so revenue numbers stay correct.
- **Why not Cashier:** Cashier (`laravel/cashier` 16.11.0) is Laravel's subscription-billing package built around a billable Customer model. This app runs one-off `mode=payment` sessions, provisions accounts **from** the webhook (no pre-existing billable user), and has its own lease-and-claim idempotent ledger (`stripe_events`) with transient/permanent error classification. Cashier would add migrations and a webhook controller we'd have to work around. **Confirmed: use `stripe/stripe-php` directly.**

### 4.3 Cloudflare R2 (AWS SDK for PHP v3)

- **Conditional write in the SDK:** the S3 API model in `aws-sdk-php` (`src/data/s3/2006-03-01/api-2.json.php`, read 2026-11-18) defines `PutObjectRequest.IfNoneMatch` → header `If-None-Match`. So `$s3->putObject([... 'IfNoneMatch' => '*'])` is supported natively, with no middleware hack. Flysystem stays out of the write path, as the plan says.
- **R2 honours it:** R2 supports `If-None-Match` on PutObject (https://developers.cloudflare.com/r2/api/s3/api/). The conditional-operations page says the condition "is evaluated at the moment the write commits", competing creates are serialised ("at most one request succeeds while its object exists"), and others get **`412 PreconditionFailed`** (https://developers.cloudflare.com/r2/api/s3/conditional-operations/). Map `412` to the existing "object already exists" handling.
- **Checksums:** since aws-sdk-php **3.337.0** the SDK adds a CRC32 checksum to uploads by default (https://docs.aws.amazon.com/sdk-for-php/v3/developer-guide/s3-checksums.html). The S3Client accepts `request_checksum_calculation` and `response_checksum_validation` with the values `when_supported` (the default) or `when_required` (read in `src/S3/S3Client.php`).
  - **Set both to `when_required`**, matching `apps/web` (`WHEN_REQUIRED`).
  - R2 accepts `Content-MD5` on PutObject, and its CRC-32 support is "COMPOSITE type only", so the SDK's default full-object checksums are a compatibility hazard.
  - Keep sending our own `ContentMD5` plus `Metadata['sha256']`.
- **Client config:** `region => 'auto'`, `endpoint => https://{account}[.{jurisdiction}].r2.cloudflarestorage.com`, `version => 'latest'`, plus the two checksum options. Retries: `'retries' => 2` (3 attempts in total, the same as `maxAttempts: 3`). Cloudflare's PHP example is https://developers.cloudflare.com/r2/examples/aws/aws-sdk-php/.
- **Presigned GET with disposition:** `$cmd = $s3->getCommand('GetObject', ['Bucket'=>…, 'Key'=>…, 'ResponseContentDisposition' => $disposition]); $s3->createPresignedRequest($cmd, '+3600 seconds')->getUri()`. The expiry check (integer 1–3600) and the `safeDownloadDisposition` port are ours. That R2 honours `response-content-disposition` on presigned GETs is **UNVERIFIED** in R2 docs (it's on the R2 S3 compatibility list as a GetObject parameter but wasn't quoted). Prove it in L8 and in the live L9 gate.
- **Health:** `HeadBucket` per namespace, as today.

### 4.4 CSRF and the strict Origin/Referer guard (they can coexist)

- Laravel 13's `PreventRequestForgery` is in the `web` group. It first trusts `Sec-Fetch-Site: same-origin` (optionally `same-site`), otherwise it falls back to the session CSRF token (`_token`, `X-CSRF-TOKEN`, or `X-XSRF-TOKEN` from the encrypted `XSRF-TOKEN` cookie). `Sec-Fetch-Site` is only sent over HTTPS. `originOnly: true` returns `403` instead of `419` (https://laravel.com/docs/13.x/csrf). The CSRF middleware is **disabled automatically in tests**.
- Our X-01 guard is stricter, has exact codes (`403 INVALID_ORIGIN`, `503 PUBLIC_SITE_URL_REQUIRED`), uses a canonical origin, and must run **before** auth, body parsing and I/O.
- **Why both can't just be stacked as-is:** the shared parity contract suite (Playwright `request`, no browser) sends `Origin` but neither `Sec-Fetch-Site` nor an XSRF token. Laravel's CSRF would answer `419` where Next answers `200`, which breaks L4 parity. It would also turn some expected `403 INVALID_ORIGIN` responses into `419` if CSRF runs first.
- **Recommendation (for an ADR):**
  - The custom `RequireCanonicalOrigin` middleware is the CSRF control for every cookie-authenticated `/api/*` mutation, which is exactly today's security model.
  - Exclude `/api/*` from `PreventRequestForgery` via `except:`. Keep `PreventRequestForgery` (default mode) for any Inertia form POSTs outside `/api/*`, if there are any.
  - Also exclude the X-01 exemptions: the Stripe webhook and the checkout magic-link endpoints.
  - Give the Origin middleware top **middleware priority** so it runs before `StartSession` and auth.
  - An architecture test asserts the middleware is on every non-exempt mutating route (already planned in `02-test-strategy.md` §7).
  - With `SameSite=Lax` cookies plus the strict Origin check, this matches the current posture.

### 4.5 Email (Postmark, Mailpit)

- Laravel mail docs (https://laravel.com/docs/13.x/mail):
  - `composer require symfony/postmark-mailer symfony/http-client`.
  - `config/services.php` → `'postmark' => ['key' => env('POSTMARK_API_KEY')]`.
  - Per-mailer `'message_stream_id' => env('POSTMARK_MESSAGE_STREAM_ID')`, plus an optional HTTP `'client' => ['timeout' => …]`. Use `timeout => 10` to match today's 10 s.
  - **Correction to `brownfield/data-model-and-ops.md` §4:** the Laravel env name is `POSTMARK_API_KEY`, not `POSTMARK_TOKEN`. The stream is `outbound`.
- Queued mailables: `implements ShouldQueue` plus `$this->afterCommit()` in the constructor, or a queue connection with `'after_commit' => true`. Jobs dispatched inside a transaction that rolls back are discarded (https://laravel.com/docs/13.x/queues).
- **Two delivery modes (refines plan §3 "Email"):**
  1. **Auth link emails (N-01…N-03, A-series): synchronous, immediately after the fence transaction commits.** On failure, delete the proof and return the fixed error. Never log the link or the provider body. A queued job can't change the HTTP response, and it would leave a live link that was never delivered. Use `Mail::mailer('postmark')->send(...)` and catch `TransportExceptionInterface`.
  2. **Lifecycle emails (N-04…N-16): queued `afterCommit` mailables with retries and backoff** (F-8). Keep the durable `email_sent:*` audit markers as the idempotency guard, because a retried job must not double-send.
- **Tests:** an SMTP mailer pointed at Mailpit (`axllent/mailpit`, SMTP 1025, UI/API 8025). Laravel docs list Mailpit for local mail. In Pest feature tests use `Mail::fake()`. In the parity suite use the real SMTP-to-Mailpit path.

### 4.6 Integration security patterns (summary)

- Stripe: signature plus ledger, with no IP allowlist needed. (Stripe suggests IP allowlisting as an additional measure. Optional at the edge. **OPEN**, low value.)
- R2: one least-privilege R2 token per environment, scoped to the two buckets, and a separate token for backups (§6.4).
- Postmark: a server token with send-only scope.
- Secrets live only in the host's env store (Forge environment, or Docker secrets), never in the repo.

---

## 5. Architectural patterns

### 5.1 Sessions with a 7-day absolute cap

- **Driver:** `SESSION_DRIVER=database`, which is Laravel's default and is backed by the `sessions` table: `id, user_id, ip_address, user_agent, payload, last_activity` (`DatabaseSessionHandler`, read in source).
- **Laravel's `lifetime` is idle-based (sliding).** `DatabaseSessionHandler` expires on `last_activity`, and garbage collection deletes rows with `last_activity <= now − lifetime`. So the absolute cap needs middleware.
- **Middleware design (`EnforceAbsoluteSession`, on every authenticated web and `/api` route, and on `GET /api/auth/session`):**
  1. At **login** and **magic-link verify**, after `Auth::login($user)`, call `$request->session()->regenerate()` (fixation defence, https://laravel.com/docs/13.x/session) and write `auth.issued_at = now()->getTimestamp()` and `auth.credential_version = $user->credential_version` into the session.
  2. On each request: if there's an authenticated user and (`issued_at` is missing, or `now − issued_at >= 604800`, or `user.email_verified` is false, or the session's `credential_version` doesn't equal the user's), then `Auth::logout()`, `session()->invalidate()`, `session()->regenerateToken()`, and treat the request as anonymous (each endpoint's own `401` or `{authenticated:false}`). The `credential_version` check is defence in depth: password change and reset **delete** the session rows already, by `user_id`, which the database handler records.
  3. Config: `SESSION_LIFETIME=10080` (7 days, so the idle expiry never cuts earlier than parity), `expire_on_close=false`, `http_only=true`, `same_site=lax`, `secure=true` in production, `serialization=json`.
  4. Recommended cookie name `__Host-lf_session` in production (it forces `Secure`, `Path=/` and no `Domain`). ADR item. Because the session cookie is new, there's no compatibility concern.
  5. Scheduler: prune sessions older than 7 days by `last_activity` daily (no row can be valid past 7 days from creation, and `last_activity` is always after creation). Optional: add a `created_at` column via a small custom handler if exact pruning is wanted. Not needed for correctness.
- **No "remember me"**, which matches today.

### 5.2 Credential fence, advisory locks and serializable transactions

- **Fence:**

  ```php
  DB::transaction(function () use ($userId) {
      DB::statement("SET LOCAL lock_timeout = '5s'");
      DB::statement("SET LOCAL statement_timeout = '20s'");
      DB::select('select pg_advisory_xact_lock(hashtextextended(?, 0))', ['auth:'.$userId]);
      // ... all auth reads and writes on this connection ...
  });
  ```

  `SET LOCAL` and transaction-scoped advisory locks both end at commit or rollback, and the timeouts approximate today's `maxWait 5 s` / `timeout 20 s`. The same pattern serves `provision:{email}` and `operator-admin-bootstrap`.
- **SERIALIZABLE per transaction:** Laravel has no isolation argument on `DB::transaction`. Issue `DB::statement('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')` as the **first statement** inside the closure. Laravel opens the transaction with PDO `beginTransaction()`, so this works as long as nothing ran before it. Assert `DB::transactionLevel() === 1` in the helper.
- **Retry and the 409 mapping:**
  - Laravel's built-in retry (`DB::transaction($cb, attempts: n)`) retries when `ConcurrencyErrorDetector` matches: PDO code `40001`, or the message contains `deadlock detected` (read in source). It doesn't check SQLSTATE `40P01` directly, so it relies on English server messages.
  - **On a nested transaction it throws `DeadlockException` instead of retrying.**
  - **Recommendation:** one `Db::serializable(callable, attempts: 3)` helper.
    - It refuses to run nested.
    - It catches `QueryException` and reads `$e->errorInfo[0]` or `getCode()` for `40001` or `40P01` (locale-independent).
    - It retries with jitter, then maps exhaustion to the existing `409` codes.
    - L3 tests force both SQLSTATEs.
- **Lost connections** (`08xxx`, `57P01`) and lock or statement timeouts (`55P03`, `57014`) map to "transient" in the webhook classifier (brownfield checkout §3.10).
- Add an explicit `projects.version` integer (brownfield note 2) and bump it in the same statement as every state change.

### 5.3 Migrations: jsonb expression index, triggers, two roles

- **Expression index:** use raw SQL in the migration so the double parentheses Postgres requires are explicit:

  ```php
  DB::statement("create index audit_events_payload_request_key_idx on audit_events ((payload->>'requestKey'))");
  ```

  `Blueprint::rawIndex()` exists, but it wraps an `Expression` as a column, so check the generated DDL in a schema test before relying on it. `jsonb` columns: `$table->jsonb('payload')`.
- **Triggers and check constraints** (`protect_operator_admin_flag`, normalised-email checks): `DB::unprepared()` with the plpgsql function and trigger in `up()`, and the drop in `down()`. Postgres DDL is transactional, so a failed migration rolls back cleanly. L3 test: an update of `is_admin` through the **runtime** connection must throw.
- **Two connections:**
  - `config/database.php` gets `pgsql` (runtime role, DML only) and `pgsql_migrate` (owner role).
  - Run `php artisan migrate --database=pgsql_migrate --force` in deploys.
  - Port `runtime-grants.sql` as a post-migrate step on `pgsql_migrate` that grants DML, sets default privileges, and **revokes runtime access to `migrations` and `auth_admin_bootstrap`**.
  - `admin:bootstrap` forces `pgsql_migrate`.
  - Tests: `RefreshDatabase` migrates on the default connection, so in the test env the default connection's user must be able to migrate. Run one Pest group (L3 "roles") against a real two-role database built by the compose init script.
- **UUID primary keys:**
  - `HasUuids` generates **UUIDv7** in Laravel 13. `HasVersion4Uuids` actually uses `Str::orderedUuid()`, which is also time-ordered (read in source).
  - v7 is fine: Postgres `uuid` columns accept any version, B-tree locality improves, and nothing in the app or the parity suite should parse UUID versions. Add a parity guard: tests compare IDs only for equality.
  - Trade-off: v7 reveals the row's creation time (milliseconds) to anyone who sees the ID (for example `/project/{id}`). That's low sensitivity for this app. Log it as an assumption.
  - Use `$table->uuid('id')->primary()`. No DB-side default is needed.

### 5.4 Rate limiting (CHANGED)

| Question | Database cache store (`RateLimiter`) | Redis store | Ported PG table (recommended) |
|---|---|---|---|
| Atomic increment? | Yes. `DatabaseStore::incrementOrDecrement` runs `SELECT … FOR UPDATE` and then `UPDATE`, inside `connection->transaction()` (source). The window key and `:timer` key are separate `add()` calls (`insertOrIgnore`) | Yes (`INCR`) | Yes. One `INSERT … ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN window_start < now()-15min THEN 1 ELSE LEAST(hits+1,100000) END, window_start = … RETURNING hits, window_start` |
| Interaction with our transactions | **Dangerous.** It runs on the default connection. Called inside the fence, it becomes a savepoint, keeps the row lock until the outer commit, and **rolls back with the fence**, so failed logins wouldn't count | None | Must also run **outside** the fence. Enforce it with `assert(DB::transactionLevel() === 0)`, or give the limiter its own connection |
| Key privacy | Keys are stored as given (`cleanRateLimiterKey` only strips HTML entities), so we'd have to sha256 them ourselves | Same | Already sha256 keys |
| Window semantics | Fixed window from the first hit (`:timer`) | Same | Identical to today (15 min, cap 100000, prune rows older than 1 h) |
| "Reserve then clear on success" (login failure bucket) | `increment` then `clear` (2 keys) | Same | `DELETE` by key, as today |
| New infrastructure | None | **A Redis server to run, secure and back up** | None |

**Recommendation:** port `lib/auth/rate-limit.ts` to one PHP class over `auth_rate_limits`, with the single-statement upsert, called before the fence opens. Use the same class for the checkout auth email limits (per session 3/15 min, per email 5/60 min), which closes the "process-local" residual risk. That makes it one mechanism, proven by the existing test cases. Laravel's `throttle` middleware (default cache = database) is fine for non-auth coarse limits, if any are added later. **No Redis.**

### 5.5 Queues, workers and the scheduler (single Hetzner box)

- **Database queue driver** on Postgres. Laravel's `DatabaseQueue` pops with **`FOR UPDATE SKIP LOCKED`** on PostgreSQL ≥ 9.5 (source), so several workers are safe. Set `'after_commit' => true` on the connection.
- **Horizon isn't applicable.** It's a dashboard and supervisor "for your Laravel powered **Redis** queues" (https://github.com/laravel/horizon).
- **Worker supervision:**
  - Run `php artisan queue:work database --tries=5 --backoff=10,60,300 --max-time=3600 --sleep=3` under supervisor (Forge or Ploi "daemons") or a systemd unit (option d).
  - Run `php artisan queue:restart` on every deploy, and after every PHP patch (Forge's advisory: long-running CLI processes keep the old PHP binary until restarted).
  - `failed_jobs` table; schedule `queue:prune-failed`.
  - **UNVERIFIED** (the docs page was truncated in fetch): the exact supervisor example values (`numprocs`, `stopwaitsecs`). Take them from the Laravel queue docs in E9.
- **Scheduler** (`* * * * * php artisan schedule:run`, or `schedule:work` under a supervisor):
  - prune `auth_rate_limits` rows older than 1 h (today this happens on each call; keep that, and add a nightly safety sweep);
  - delete expired `auth_proofs`;
  - prune sessions idle over 7 days;
  - `queue:prune-failed --hours=720`;
  - nightly `pgbackrest check` / backup freshness check;
  - a weekly report of `composer audit` results (CI also runs it).

### 5.6 Password hashing

- Laravel's default is `bcrypt`, cost 12 (`config/hashing.php` in the framework). `BcryptHasher` supports a `limit` option (`BCRYPT_LIMIT`): with it set, it **throws** for values longer than the limit instead of silently truncating at 72 bytes (source).
- **Recommendation: bcrypt plus `BCRYPT_LIMIT=72`**, and keep the existing 8-character / 72-byte validation rule and messages (A-series parity). The validator rejects first, and the hasher limit is a second safety net.
- Argon2id has no 72-byte limit, but it would change the visible password rule (a parity deviation) for no security need here. If chosen later, note that `PASSWORD_ARGON2ID` support depends on how PHP was built. Whether the official `php:8.5` Docker images and Forge's PHP packages include it is **UNVERIFIED**.

### 5.7 Why no Fortify, Breeze or Jetstream

- Breeze and Jetstream "will no longer receive additional updates" (https://laravel.com/docs/master/releases).
- The new starter kits and Fortify register their own login, registration, reset and verification routes and flows (Laravel docs say Fortify and the starter kits regenerate sessions and provide "login, registration, password reset, email verification").
- This app needs **no public registration** and **only the listed `/api/auth/*` endpoints** (brownfield auth §4: "no native catch-all"). It also needs single-use sha256-hashed proofs tied to `credential_version`, setup that degrades to magic, fragment tokens with a click-to-confirm page, and the advisory-lock fence. Turning Fortify features off and rebuilding these around it is more code and more attack surface than plain action classes on the session guard.
- **Confirmed: use `Auth::guard('web')` (session) with custom actions. No starter-kit routes.**

### 5.8 Trusted client address with PHP-FPM behind nginx

- Laravel's `TrustProxies` supports explicit IPs or CIDRs and header sets. The docs allow `'*'` for unknown cloud balancers (https://laravel.com/docs/13.x/requests). **Don't use `'*'`** (brownfield §7).
- **New design point:** with Forge or Ploi (nginx → PHP-FPM over a unix socket) there's **no HTTP proxy hop**. PHP sees `REMOTE_ADDR` = the TCP peer. The two existing modes still apply:
  - (i) **No CDN in front:** set `AUTH_CLIENT_IP_HEADER` to a dedicated name that nginx always **overwrites** from `$remote_addr`. Or architecture adds an explicit third mode, "direct peer address", which is a logged deviation.
  - (ii) **Cloudflare proxy (orange cloud) in front:** `AUTH_CLIENT_IP_HEADER=cf-connecting-ip`, **with the origin firewall allowing 80/443 only from Cloudflare's published IP ranges**. Otherwise anyone can forge the header by hitting the origin IP directly.
- That nginx's `fastcgi_param` override fully replaces a client-supplied header of the same name is **UNVERIFIED**. Prove it in an L9 test ("forged header ignored") before go-live. This is X-05.

---

## 6. Implementation research

### 6.1 Testing stack

- **Pest 5** (requires PHP 8.4+; the browser plugin `pest-plugin-browser` exists but isn't needed, because Playwright owns the browser layer), `pest-plugin-laravel` 5.x, and **real PostgreSQL 18** in Docker for L2 and L3. Never SQLite.
- **Parallel:** `php artisan test --parallel` with `brianium/paratest`. Laravel creates and migrates one database per process (`<db>_test_<token>`), and has `--recreate-databases` and `ParallelTesting` hooks (https://laravel.com/docs/13.x/testing).
  - L3 concurrency tests need **committed** data across connections, so `RefreshDatabase` transactions don't work for them. Run them as a separate serial group with `DatabaseTruncation`/`DatabaseMigrations` and their own database.
- **Larastan** at **level 9 from day one** (greenfield, no baseline file allowed). An E1 spike decides whether level 10 (the PHPStan 2 maximum) is practical with Eloquent. **Pint** with the Laravel preset. Both run in pre-commit and CI (L0).
- **Playwright 1.64.1** for the shared parity suite (L4–L8), with **@axe-core/playwright 4.14.0** for L7a. Pin the matching Playwright Docker image and browsers by version in CI.

### 6.2 Local S3 stand-in: SeaweedFS, not MinIO (CHANGED)

- **MinIO:**
  - The GitHub repository "was archived by the owner on Apr 25, 2026. It is now read-only". The last release, RELEASE.2025-10-15T17-29-55Z, tells users to `go install` or build the image themselves (https://github.com/minio/minio/releases).
  - The Docker Hub API returned "object not found" for `minio/minio` tags on 2026-11-18 (**UNVERIFIED** whether the images moved or were withdrawn).
  - MinIO did implement conditional writes: support was "initially merged … in February 2023", with both `If-Match` and `If-None-Match` (https://www.min.io/blog/leading-the-way-minios-conditional-write-feature-for-modern-data-workloads, updated 2025-02-05). A 2025-09-07 release fixed conditional-write bugs.
  - But building a test dependency on an archived project with no supported images is a maintenance and supply-chain risk.
- **SeaweedFS** is active (4.54 on 2026-11-16; images on `chrislusf/seaweedfs`). Its wiki documents `If-None-Match: *` as "compare-and-create", where "at most one of any number of concurrent PUTs for the same key succeeds; the rest return 412". The check and the write are "atomic, cluster-wide" (https://github.com/seaweedfs/seaweedfs/wiki/S3-Conditional-Operations). The version that introduced it isn't stated (**UNVERIFIED**), so the probe test below is mandatory.
- **Plan change for E0** (`02-test-strategy.md` §3 and §7 say MinIO):
  - Use SeaweedFS (`weed server -s3` or `weed mini`) in `docker-compose.test.yml`.
  - Add a **probe test**: two concurrent PUTs with `If-None-Match: *`, where exactly one returns 200 and the other 412; then `HEAD`, a presigned `GET` with `response-content-disposition`, and `Content-MD5` rejection on mismatch.
  - If any probe fails, use the planned fallback: L3 stub plus the live L9 check.
  - Apply the same change in the Next.js test seam (an R2 endpoint override pointing at SeaweedFS).
- Other options seen: MiniStack (conditional PUT since v1.3.46, 2026-05-21) and Robothy/local-s3 (support was still an open PR). Not recommended over SeaweedFS.

### 6.3 CI (GitHub Actions)

- **Use `docker compose -f docker-compose.test.yml up -d --wait` inside the job**, rather than `services:`, for all three backing services (postgres, mailpit, seaweedfs). The same compose file serves local runs, the parity suite and CI (D6), and the S3 stand-in needs a custom start command and a bucket bootstrap. GitHub `services:` containers don't take a `command` (based on the GitHub workflow syntax for `jobs.<id>.services`; re-check in E0).
- Jobs as planned: `laravel-ci` (Pint, Larastan, Pest with parallel L1/L2, then the serial L3 group) and `parity` (matrix `target: [next, laravel]`).
- Add a `security` job: `composer audit --locked`, `npm audit --omit=dev`, and the ported secret scan.

### 6.4 Hosting on Hetzner: options compared

| | (a) Forge → Hetzner Cloud | (b) Ploi → Hetzner Cloud | (c) Coolify on a Hetzner VPS | (d) Plain Docker Compose + Caddy or nginx |
|---|---|---|---|---|
| What it is | Laravel's server manager. It provisions Ubuntu with nginx, PHP and Postgres through the Hetzner API | Similar manager. An official Hetzner partner (https://ploi.io/news/partnership-with-hetzner) | A self-hosted PaaS running Docker containers | Our own compose file, images built in CI |
| OS security patching | Ubuntu unattended-upgrades. **PHP isn't covered**: "Forge's automatic security updates do not patch PHP", so update it from the dashboard or API (https://laravel.com/forge/docs/knowledge-base/php-security-release-october-2026.md) | "Automatic server updates" on Basic and above. Whether that covers PHP is **UNVERIFIED** | Host via unattended-upgrades (ours to set up). App PHP comes from rebuilt images | Host ours. PHP comes from image rebuilds (rebuild on every PHP security release) |
| Zero-downtime deploys | Included on every plan (single server) | Pro and above | Rolling container updates (details **UNVERIFIED**) | Ours to script (symlink release dirs or blue/green containers) |
| Queue worker supervision | Daemons (supervisor) plus a scheduler UI | Queue and daemon management on all plans | Container restart policies | systemd or a compose `restart:` policy |
| TLS / HSTS | Let's Encrypt. HSTS is an nginx header we add | Let's Encrypt (all plans) | Built-in proxy with Let's Encrypt | Caddy automatic HTTPS. HSTS header in the Caddyfile |
| Firewall, app reachable only via the proxy | ufw managed by Forge. PHP-FPM is on a unix socket, so there's no app port at all | Firewall on Basic and above | Containers behind its proxy. **Docker-published ports bypass ufw** (https://docs.docker.com/engine/network/packet-filtering-firewalls/) | Same Docker/ufw bypass caveat |
| Postgres | Forge installs PostgreSQL (PG 18 supported per the Forge changelog). Database backups are a plan feature | PostgreSQL 13–17 listed (https://ploi.io/server-installation). **PG 18 is UNVERIFIED** | A Postgres container | A Postgres container or a host install |
| Cost (management only) | Hobby $12/mo (1 external server), Growth $19/mo | Basic €8, **Pro €13**, Unlimited €30 per month | Self-hosted free (the cloud tier's price is **UNVERIFIED**) | Free |
| Fit with this project | Built for Laravel; least custom ops | Equivalent, cheaper; Postgres 18 needs confirming | Adds a PaaS layer to run and patch | Most control, most runbook work. Same images as CI |

**For every option:** put a **Hetzner Cloud Firewall** in front. It's free, it isn't bypassed by Docker iptables rules because it sits outside the host, and it's applied by label (https://docs.hetzner.com/cloud/firewalls/overview/). Allow inbound 22 (from the owner's IPs, or Forge or Ploi IPs only), 80 and 443 (from everywhere, or **only Cloudflare ranges** if proxied). Postgres is never exposed publicly.

**Recommendation: (a) Forge provisioning one Hetzner Cloud server** (Ubuntu 26.04 LTS or 24.04 LTS, nginx + PHP 8.5-FPM, PostgreSQL 18, the queue worker and the scheduler as Forge daemons), unless the owner already pays for Ploi.

- **Why:** it's first-party for Laravel; zero-downtime deploys, daemons, the scheduler and TLS come with it; there's no app port at all (FPM socket), which satisfies the trusted-proxy rule by construction; and it needs the smallest number of custom runbooks.
- **Docker stays the local, parity and CI environment (D6).** The production/CI difference is managed by pinning the same PHP minor and extensions, plus a smoke test after each deploy.
- **If the owner already pays for Ploi:** choose (b) on Pro, after confirming PostgreSQL 18 support.
- **If the owner prefers immutable images:** (d) is the fallback. Coolify (c) isn't recommended, because it adds a PaaS to run and patch.

**PostgreSQL placement.** For launch, run it **on the same box**: small data, a single tenant, the lowest latency and cost, and one fewer machine to patch. Use separate roles, `listen_addresses = 'localhost'` (or the private network only), and `scram-sha-256` auth. Move to a separate Hetzner Cloud server on a private network if load or blast-radius concerns appear. This is a decision for the owner (see section 9).

**Backups (release gate, from the 2026-07 Supabase pause lesson):**
- **pgBackRest 2.60.x** (repo types include `s3` and `sftp`; client-side `aes-256-cbc` encryption; https://pgbackrest.org/configuration.html). WAL archiving gives point-in-time recovery, plus scheduled full and differential backups.
  - **repo1: an R2 bucket** dedicated to backups, using a separate R2 token from the app's.
  - **repo2: a Hetzner Storage Box** over `sftp`. It supports SFTP and SCP and snapshots, but "the disks are on a single host server" (https://docs.hetzner.com/storage/storage-box/general/), which is why it's the second repo and not the only one.
  - That R2 is compatible with pgBackRest's S3 driver (region `auto` and the URI style) is **UNVERIFIED**. Prove it in the restore drill. If it fails, use `wal-g` (v3.0.9, 2026-08-20) as the alternative.
- **Hetzner Cloud server backups** (daily, 7 slots; https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/) are a useful whole-machine fallback. They're **not** a database backup: the docs don't promise application-consistent snapshots.
- **Restore drill:** a scripted `pgbackrest restore` to a scratch server (or a Docker container) from **each** repo, then `php artisan migrate:status` plus row-count checks, then a smoke login. Record it as an owner-run gate, and re-run it quarterly.

**Edge headers:** HSTS (`max-age=31536000; includeSubDomains`, and `preload` only by owner decision) is set at nginx or Caddy, or at Cloudflare if proxied. Don't set it from Laravel. That keeps the existing "HSTS at the TLS edge" gate.

### 6.5 Security tooling

- **`composer audit`** (Composer 2.11.x) in CI and weekly. Optionally `roave/security-advisories` as a dev dependency (it blocks installing known-vulnerable versions). Its Packagist metadata didn't resolve in my query, so its status is **UNVERIFIED**.
- **Enlightn: rejected.** Its last release was 2024-04-05, it supports Laravel 9–11 only, and its GitHub repo is archived. No maintained Laravel-specific SAST replacement was verified. Use Larastan at a high level plus the ported `security-check` script, and consider adding a general PHP SAST (for example Semgrep rules) in E1 (**UNVERIFIED** choice).
- **CSP:** `spatie/laravel-csp` 3.30+ is actively maintained (supports Laravel 12 and 13). It supports `report_only_presets`, `report_only_directives` and a separate `report_only_uri`, and has nonce support. That covers X-02's **report-only** CSP. Configure Vite's CSP nonce (`Vite::useCspNonce()`) for the Inertia script tags.
  - Alternative: a 20-line custom middleware that sets `Content-Security-Policy-Report-Only` with the same directives as `apps/web/next.config.ts`. Either works.
  - **Recommendation:** a custom middleware for exact header parity, unless nonces are needed. Decide in architecture.
- **Other X-02 headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `no-store` plus `no-referrer` on the three token pages. One middleware, asserted by the existing smoke test.

---

## 7. Synthesis: plan §3 row-by-row verdicts

| §3 concern | Plan recommendation | Verdict | Decision-ready recommendation and why |
|---|---|---|---|
| Framework | Laravel current stable on PHP 8.4+ | **CONFIRMED** (pins added) | **Laravel 13** (`^13.39`) on **PHP 8.5** (≥ the 2026-11-19 security release). 13 is the current major, with security fixes to 2028-03-17. The PHP floor is 8.4 because Pest 5 and Postmark mailer 8 need it, and 8.5 has the longest support. ADR-001 records the pin policy (section 1) and a Laravel 14 upgrade story after launch |
| UI | Inertia + React + TS + Tailwind 4 | **CONFIRMED** | Inertia **v3** (server ^3.7, client 3.11.0 from 2026-11-23), React **19.3**, Vite 8 with `laravel-vite-plugin` 3.2, Tailwind 4.3 via `@tailwindcss/vite`, **TypeScript 6.0.3** (7.x is OPEN for an E1 spike). **No SSR** (noindex, authenticated portal) |
| JSON API | Same `/api/*` contracts | **CONFIRMED** (one routing note) | Register `/api/*` in the `web` group (stateful session). Not `routes/api.php` defaults |
| Auth | Session guard, database sessions, custom actions, no starter kits | **CONFIRMED** | Database sessions plus `EnforceAbsoluteSession` middleware (`issued_at` in the session, a 604800 s cap, `email_verified` and `credential_version` checks), `regenerate()` on login and magic verify, `invalidate()` on logout, bcrypt with `BCRYPT_LIMIT=72` and the existing 72-byte rule, the fence via `pg_advisory_xact_lock` with `SET LOCAL` timeouts. No Fortify, Breeze or Jetstream (section 5.7) |
| CSRF (implied by Auth and X-01) | "Decide in architecture" | **OPEN (architecture), recommendation given** | The custom canonical-Origin middleware is the CSRF control for `/api/*`. Exclude `/api/*` and the X-01 exemptions from `PreventRequestForgery` so parity codes hold (403, not 419), and keep `PreventRequestForgery` for any non-API form posts (§4.4) |
| DB | PostgreSQL, Laravel migrations, snake_case, advisory locks as-is | **CONFIRMED** | **PostgreSQL 18.7**. Two connections (`pgsql`, `pgsql_migrate`) with `migrate --database=pgsql_migrate`. Raw-SQL triggers and the jsonb expression index. A `Db::serializable()` helper mapping `40001`/`40P01` → retry → 409. UUIDv7 via `HasUuids` is acceptable (log the timestamp-exposure assumption) |
| Payments | `stripe/stripe-php`, not Cashier | **CONFIRMED** | `stripe/stripe-php ^22.1` with `stripe_version => '2026-02-25.clover'` on the client. The live webhook endpoint is registered on the same version. `constructEvent` on the raw body (300 s tolerance). `allow_promotion_codes=true` (F-1) works with our `custom_fields` + `invoice_creation` + `customer_creation=always`. Upgrading the API version is a post-parity ADR |
| Storage | AWS SDK for PHP against R2 (not Flysystem for writes) | **CONFIRMED** | `aws/aws-sdk-php ^3.402`, `IfNoneMatch => '*'` (modelled in the SDK; R2 returns 412 on conflict), `request_checksum_calculation` and `response_checksum_validation` = `when_required`, `ContentMD5` plus sha256 metadata, presigned GET with `ResponseContentDisposition` (R2 behaviour proven at L8/L9) |
| Email | Laravel Mail, Postmark, `afterCommit` queued mailables, Mailpit in tests | **CONFIRMED with refinement** | Postmark via `symfony/postmark-mailer` (`POSTMARK_API_KEY`, stream `outbound`, 10 s timeout). **Auth link emails are sent synchronously after commit** (delete the proof on failure). Lifecycle emails are queued `afterCommit` jobs with retries plus the existing `email_sent:*` markers |
| Queue | Database queue plus a supervised worker | **CONFIRMED** | Database driver (`FOR UPDATE SKIP LOCKED` on PG), `after_commit=true`, one or two `queue:work` processes under Forge daemons (or systemd), `queue:restart` on deploy and after PHP patches. **No Horizon** (Redis-only). Scheduler jobs listed in §5.5 |
| Rate limiting | Laravel `RateLimiter` on a shared store | **CHANGED** | **Port the existing atomic Postgres limiter** (`auth_rate_limits`, a single-statement upsert with sha256 keys), called outside transactions, and use it for the checkout-email limits too. Why: the DB cache store's lock-and-increment runs in a transaction on the default connection and would roll back inside the fence. Redis adds infrastructure for no benefit at this scale. The existing tests port directly. Still shared (it closes the process-local residual risk) |
| Tests | Pest on real PG, Larastan, Pint, Playwright parity suite | **CONFIRMED with one CHANGE** | Pest 5.3 plus pest-plugin-laravel 5, paratest, Larastan level 9 (10 if achievable), Pint, Playwright 1.64.1, axe 4.14. **The S3 stand-in changes from MinIO (archived) to SeaweedFS**, gated by a conditional-PUT probe test. CI uses `docker compose` rather than `services:` |
| Location | `apps/portal` next to `apps/web` | **CONFIRMED** | No research finding against it |
| Hosting (D5) | Decide in 1.2 | **OPEN (owner input)** | Recommend **Forge → Hetzner Cloud, one server**: nginx, PHP 8.5-FPM, PG 18 local, Hetzner Cloud Firewall, pgBackRest to R2 plus a Storage Box, a restore drill gate, and an explicit PHP-patch runbook. Ploi Pro is an equal alternative if already paid for |

---

## 8. Risks found

Each is written so it can be copied into `RISKS.md`. Owner of most: the architect (E1/E9 stories).

1. **PHP critical security cadence.** Two RCE-class PHP CVEs were fixed on 2026-10-21, and another critical release is due 2026-11-19. Forge's (and probably any apt-based) unattended upgrades don't patch PHP. Likelihood high, impact high. Mitigation: a PHP-patch runbook (Forge "Update PHP", then `queue:restart`), a monitor on php.net release announcements, and CI image rebuilds on each PHP release.
2. **MinIO is archived (2026-04-25) and its images aren't published.** The test plan (`02-test-strategy.md`) depends on it. Likelihood high, impact medium. Mitigation: switch E0 to SeaweedFS with the conditional-PUT probe, plus the L3-stub fallback.
3. **The Stripe API version gap.** `2026-02-25.clover` is three releases behind (dahlia, then endive). Running an old version via override is supported in PHP, but new SDK docs and examples target newer shapes. The webhook endpoint version must match. Likelihood medium, impact medium. Mitigation: pin explicitly, register the live endpoint on clover, capture fixtures from the clover endpoint, and plan a post-parity upgrade ADR.
4. **CSRF middleware vs parity codes.** Laravel's `PreventRequestForgery` would return 419 where Next returns 200 or 403 for non-browser contract calls. Likelihood high if left at defaults, impact medium. Mitigation: §4.4 (exclude `/api/*`, the Origin middleware first, an architecture test).
5. **Rate-limit rollback inside the fence.** If any limiter call runs inside a transaction, failed attempts vanish on rollback (login brute-force protection silently weakened). Likelihood medium, impact high. Mitigation: a ported single-statement limiter plus a `transactionLevel()===0` assertion plus an L3 test (wrong password inside the fence still counts).
6. **Concurrency error detection depends on the message.** Laravel retries `40P01` only by matching "deadlock detected", and won't retry nested transactions. Likelihood low, impact medium. Mitigation: our own `Db::serializable()` helper, keyed on SQLSTATE.
7. **Trusted client IP under PHP-FPM.** There's no proxy hop. A misconfigured nginx `fastcgi_param` or an origin reachable around Cloudflare lets clients forge the IP used for rate limits. Likelihood medium, impact high. Mitigation: §5.8, a Cloud Firewall restricted to Cloudflare ranges if proxied, and an L9 "forged header ignored" test.
8. **Self-managed Postgres.** No Hetzner Cloud managed PG means backups and restore are on us (the lesson of the Supabase pause incident). Likelihood medium, impact high. Mitigation: pgBackRest to two repos, a monitored backup freshness check, a restore drill as a release gate and quarterly.
9. **pgBackRest with R2 is unproven.** The S3-compatibility details (region and URI style) are unverified. Likelihood medium, impact medium. Mitigation: prove it in the drill, with the Storage Box repo and wal-g as fallbacks.
10. **Docker ports bypass ufw** (only for options c and d, or any Docker in production). Likelihood medium, impact high. Mitigation: a Hetzner Cloud Firewall (outside the host), bind containers to 127.0.0.1, and Postgres never published.
11. **The Laravel 13 lifecycle.** Laravel 14 is expected around Q1 2027. Laravel 13 bug fixes end Q3 2027 and security fixes 2028-03-17. Likelihood certain, impact low. Mitigation: a scheduled upgrade story after launch.
12. **Version freshness.** Many packages release weekly (Laravel, the AWS SDK daily). Pinning to "3 weeks old" can miss security patches. Likelihood medium, impact medium. Mitigation: the pin policy in section 1, where security advisories bypass the age rule.
13. **The UUIDv7 timestamp leak.** IDs in URLs reveal when a record was created. Likelihood certain, impact low. Mitigation: accept and log as an assumption, or use v4 via a custom `newUniqueId()` if the owner objects.
14. **TypeScript 7 tooling maturity** (if 7 is chosen). The ported TS modules and ESLint plugins may lag. Likelihood medium, impact low. Mitigation: TS 6.0.3 now, a 7.x spike in E1.
15. **An R2 presign quirk.** That `response-content-disposition` is honoured on R2 presigned GETs and that UTF-8 `filename*` survives is unverified. Likelihood low, impact medium (the finals download filename). Mitigation: L8 against SeaweedFS plus a live L9 check against R2.

---

## 9. Questions for the owner

1. **Which server-management tool do you already pay for:** Laravel Forge, Ploi, something else, or none? (The recommendation is Forge on Hetzner Cloud. Ploi Pro is equivalent if it's already paid for.) Which Hetzner products do you have: Cloud project, dedicated/robot server, Storage Box?
2. **Will DNS for the portal be proxied through Cloudflare** (orange cloud)? This decides `AUTH_CLIENT_IP_HEADER` (`cf-connecting-ip` plus a Cloudflare-only origin firewall) versus an nginx-set header, and where HSTS is set.
3. **Postgres placement:** is the same server as the app acceptable for launch (recommended), or do you want a separate database server on a Hetzner private network from day one (more isolation, about one more small server to pay for and patch)?
4. **Backup targets:** may pgBackRest use a **dedicated R2 bucket** (separate token) as the primary repo, plus a **Hetzner Storage Box** as the second copy? What retention do you want (suggested: 14 days of point-in-time recovery, 8 weekly fulls)?
5. **Stripe:** confirm we stay on API version `2026-02-25.clover` through parity and cutover, with an upgrade only afterwards. Can you create the live webhook endpoint pinned to that version at the release gate?
6. **Promotion code** `PRO40FIRST5`: is it still active in Stripe and limited to first-time customers? F-1 enables entry, and it only works for first-time customers because `customer_creation=always`.
7. **HSTS preload:** do you want `preload` (hard to undo, covers all subdomains, including the marketing site), or just `max-age` plus `includeSubDomains`?
8. **UUIDv7:** are you OK with IDs that encode their creation time (default Laravel 13 behaviour), or do you want random v4 IDs?
9. **Ops alerts:** where should backup-failure, failed-job and PHP-release alerts go (email address or channel)? The scheduler checks need a destination.

---

## 10. Sources (all read 2026-11-18)

- PHP: https://www.php.net/ · https://www.php.net/supported-versions.php · https://www.php.net/releases/
- Laravel: https://laravel.com/docs/13.x/releases · https://laravel.com/docs/master/releases · https://laravel.com/docs/13.x/csrf · https://laravel.com/docs/13.x/session · https://laravel.com/docs/13.x/rate-limiting · https://laravel.com/docs/13.x/mail · https://laravel.com/docs/13.x/queues · https://laravel.com/docs/13.x/database · https://laravel.com/docs/13.x/testing · https://laravel.com/docs/13.x/requests · https://github.com/laravel/framework/releases
- Laravel 13.x source (raw.githubusercontent.com/laravel/framework/13.x/src/Illuminate/…): `Cache/DatabaseStore.php`, `Cache/RateLimiter.php`, `Database/ConcurrencyErrorDetector.php`, `Database/Concerns/ManagesTransactions.php`, `Queue/DatabaseQueue.php`, `Database/Eloquent/Concerns/HasUuids.php`, `HasVersion4Uuids.php`, `Database/Schema/Blueprint.php`, `Hashing/BcryptHasher.php`, `Session/DatabaseSessionHandler.php`, `Foundation/Http/Middleware/PreventRequestForgery.php`. Skeleton: https://github.com/laravel/laravel/tree/13.x (package.json, composer.json, config/session.php)
- Packagist metadata: https://repo.packagist.org/p2/{vendor}/{package}.json for every PHP package in section 2
- npm registry: https://registry.npmjs.org/{package} for every JS package in section 2 · Node: https://nodejs.org/dist/index.json
- Inertia: https://inertiajs.com/docs/v3/getting-started/upgrade-guide · https://github.com/inertiajs/inertia/releases · https://github.com/inertiajs/inertia-laravel/releases
- Stripe: https://raw.githubusercontent.com/stripe/stripe-php/master/CHANGELOG.md · https://docs.stripe.com/sdks/versioning?lang=php · https://docs.stripe.com/sdks/set-version?lang=php · https://docs.stripe.com/api/checkout/sessions/create · https://docs.stripe.com/webhooks/signature · stripe-php `lib/Webhook.php`
- R2 and AWS: https://developers.cloudflare.com/r2/api/s3/api/ · https://developers.cloudflare.com/r2/api/s3/conditional-operations/ · https://developers.cloudflare.com/r2/examples/aws/aws-sdk-php/ · https://docs.aws.amazon.com/sdk-for-php/v3/developer-guide/s3-checksums.html · aws-sdk-php `src/S3/S3Client.php` and `src/data/s3/2006-03-01/api-2.json.php`
- S3 stand-ins: https://github.com/minio/minio/releases · https://www.min.io/blog/leading-the-way-minios-conditional-write-feature-for-modern-data-workloads · https://github.com/seaweedfs/seaweedfs/wiki/S3-Conditional-Operations · https://github.com/seaweedfs/seaweedfs/releases · https://ministack.org/blog/changelog-v1-3-46 · https://github.com/Robothy/local-s3/issues/289
- PostgreSQL: https://www.postgresql.org/support/versioning/ · Docker Hub `library/postgres`
- Hosting: https://laravel.com/forge/pricing · https://laravel.com/forge/docs/knowledge-base/php-security-release-october-2026.md · https://laravel.com/forge/docs/changelog · https://ploi.io/pricing · https://ploi.io/news/partnership-with-hetzner · https://ploi.io/server-installation · https://github.com/coollabsio/coolify/releases · https://docs.hetzner.com/cloud/firewalls/overview/ · https://docs.hetzner.com/storage/storage-box/general/ · https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/ · https://docs.hetzner.com/managed/general/softwareupdates/ · https://encore.dev/articles/hetzner-vs-digitalocean · https://docs.docker.com/engine/network/packet-filtering-firewalls/
- Backups: https://pgbackrest.org/configuration.html · https://github.com/pgbackrest/pgbackrest/releases · https://github.com/wal-g/wal-g/releases
- Tooling: https://pestphp.com/docs/installation · https://github.com/larastan/larastan · https://getcomposer.org/versions · https://github.com/spatie/laravel-csp · https://github.com/laravel/horizon · https://github.com/enlightn/enlightn (archived) · https://github.com/axllent/mailpit/releases
