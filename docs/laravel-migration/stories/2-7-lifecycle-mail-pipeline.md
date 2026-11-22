# Story 2.7: Lifecycle mail pipeline

**Status:** ready-for-dev (2026-11-22), **start blocked on the owner's answers to *Open questions* 1 and 5** · **DoD variant:** Laravel-only · **Epic:** 2 · **Covers:** X-18, DV-8, N-14 (minimal base only), NFR-R5 (lifecycle half), ADR-018, ADR-019 · **Gate:** Pest · **After:** 2.4, 1.1a (stack on `workbench/2-4-tx`, the 2.4 builder's branch, which contains 2.1 `workbench/schema` but **not** 2.2; unmerged). Whether to bring in 2.2 is *Open questions* 5 (**OPEN, owner**).

> Created with BMAD `create-story`, from the researcher draft in `reports/story-drafts-2-4100.md` (Workbench). Its `file:line` citations were checked against `apps/web`, the portal on `workbench/2-4-tx` and `workbench/2-2-models`, the vendored framework and the docs, and corrected (see *Doc / code disagreements*). The structure follows `stories/2-5-shared-rate-limit-store.md` and `templates/story-conversion-record.md`. Docs only: no portal code was written for this file.

## Story
As the portal, I need one helper that sends a lifecycle email at most once per event, dispatches it only after the action has committed, and retries on transport failure, so that user actions never fail or duplicate because of mail, and the `email_sent:*` markers keep their meaning.

## Scope
- **In:** `LifecycleMail::sendOnce`, the queued job and its mailable, the marker, the minimal base layout, Postmark transport and config (including the Composer packages it needs), `config/queue.php` `after_commit`, and tests with a test transport.
- **Out:** the nine N-04…N-12 senders and their copy (the feature stories that own the routes: 5.x webhook, 6.x/7.x concepts, messages, revisions, finals); the branded base with the logo (4.4); auth-link mail (synchronous, 4.2, ADR-018); checkout mail (5.x); the Laravel `@email` parity journeys (later stories; *Open questions* 9).

## Acceptance criteria
From `epics.md:265-269` (§2.7), ADR-018, ADR-019 and DV-8 (`01-feature-inventory.md:179`), expanded.

1. **Result type.** `LifecycleMail::sendOnce(string $type, string $projectId, ?string $key, LifecycleMessage $message)` (exact signature is the dev agent's) returns `sent`, `already_sent`, or `skipped` with reason `not_configured` or `missing_recipient`, as Next (`project-lifecycle-email.ts:12-15`). `sent` means **queued**, not delivered (*Open questions* 4). → `LifecycleMailTest`.
2. **Marker key.** The marker type is `email_sent:<type>` or `email_sent:<type>:<key>`, matching the N-series table exactly (`business-rules-and-notifications.md:64-72`), including the two keyless forms: `email_sent:admin_new_project` (`:70`) and `email_sent:client_final_deliverables_ready` when no asset id is passed (`project-lifecycle-email.ts:268-270`). The helper builds keys; callers don't concatenate strings. → `LifecycleMailTest` (dataset: one row per N-04…N-12 format, with and without key).
3. **Dedupe.** Before anything else, a marker for the same `(project_id, type)` means `already_sent`, and nothing is dispatched (Next `alreadySent`, `:100-103`, `:151`, `:182`). A marker is an `audit_events` row written through 2.4's `Audit::record($type, $projectId, null, [])`: `actor_id` null, payload `{}` (Next `markSent`, `:105-107`; `Audit::encodePayload` already stores `[]` as `{}`). → `LifecycleMailTest`.
4. **Skips are decided at call time.** `not_configured` and `missing_recipient` are returned synchronously, before any dispatch, and write no marker, because callers act on them: the Stripe webhook throws on `skipped` in production (`apps/web/src/app/api/stripe/webhook/route.ts:203-205`), and `finals/notify` returns a response for it (`admin/projects/[id]/finals/notify/route.ts:107-108`). Client recipient: the client's `billing_email`, else the owner membership's user email, else the first membership's (`resolveClientEmail` `:60-66`, `resolveClientOwner` `:46-48`); none → `missing_recipient` (`:154`). Admin recipients: `ADMIN_NOTIFICATION_EMAILS`, split on commas, trimmed, lowercased, empty dropped (`:17-22`); empty list → `missing_recipient` (`:184`). Not configured: no Postmark token or no from address (`:113-116`, warning logged; Laravel rule in *Open questions* 7). Order of checks as Next: marker (AC 3), then recipient, then configuration (`sendEmail` checks config only after the recipient is resolved, `:151-157`, `:113`), so with neither a recipient nor a token the result is `missing_recipient`. → `LifecycleMailTest` (dataset includes the both-missing case).
5. **After commit (ADR-019, decided).** `config/queue.php` sets `after_commit => true` on the `database` connection (today `false`, `config/queue.php:44`), and the job also implements `ShouldQueueAfterCommit` so it holds on any connection (the test env uses `sync`, `phpunit.xml:38`). Inside a transaction that rolls back: no job row and no marker. Inside `Db::serializable()`, a retried attempt queues nothing extra (2.4: side effects go through `DB::afterCommit()`, `AGENTS.md` §8). → `LifecycleMailAfterCommitTest` on the `database` queue connection with the real `jobs` table (not `Queue::fake()`, which records the push at dispatch and doesn't model commit/rollback).
6. **Retry.** A transport failure is retried with backoff 10 s, 60 s, 300 s (`epics.md:267`), then the job fails into `failed_jobs`. The user's action stays committed. → `LifecycleMailRetryTest` (throwing test transport; asserts `backoff()`, `tries` and that the action's rows survive).
7. **No provider text in logs or stored errors.** On failure the job logs `Postmark send failed (<status>)` (Next `:136-137`) and rethrows a sanitised exception carrying only that text. Symfony's Postmark transport puts the provider's response message into its exception text, and Laravel writes the exception text into `failed_jobs.exception`, so catching and replacing it is required, not optional. → `LifecycleMailRetryTest` (log and `failed_jobs.exception` assertions with a transport that throws a message containing a sentinel body).
8. **Transport and stream.** Postmark mailer with `message_stream_id` `outbound` (Next `:131`; ADR-018). Token, from address and stream come only from `config/*.php` (`AGENTS.md` §5 *Config* row). Keep Next's environment names (`POSTMARK_SERVER_TOKEN` `:110`, `POSTMARK_FROM` `:111`, `ADMIN_NOTIFICATION_EMAILS` `:18`) so the production env doesn't change. The skeleton's `services.postmark.key => env('POSTMARK_API_KEY')` (`config/services.php:17-18`) is replaced; Laravel reads `token` or `key` (`MailManager::createPostmarkTransport`). → `LifecycleMailConfigTest`.
9. **Postmark packages.** Laravel's Postmark transport needs `symfony/postmark-mailer` and `symfony/http-client`; neither is installed (they appear only under `suggest` in `composer.lock:1325-1328`, and are absent from `vendor/symfony`). Add both with caret constraints, `composer.lock` committed, under the pin policy (`AGENTS.md` §4: ≥ ~3 weeks old). → `composer validate` and the config test resolving the transport.
10. **Minimal base layout (N-14 base).** `resources/views/mail/layouts/base.blade.php` (+ text variant) renders heading, intro, CTA label/URL and footer. Text body as Next: `"<intro>\n\n<ctaLabel>: <url>"` (client, `:160`); admin adds `"Client: <name>\nBrand: <brand>"` (`:191`, `:195`; values from AC 11). Footers: client `"This is a transactional project update from Logo Fountain."` (`:166`), admin `"Admin notification for transactional workflow updates."` (`:201`). The CTA URL is `PUBLIC_SITE_URL` + path and must be absolute `https`, except loopback `http` outside production (`business-rules-and-notifications.md:60`; `email-branding.ts:11-20`, `:37`). No logo (that's 4.4; Next's logo comes from `EMAIL_LOGO_URL` or `/img/logo.svg`, `email-branding.ts:59-65`). → `LifecycleMailRenderTest` (text and HTML; `http://example.com` CTA refused; escaping).
11. **Admin context (shared by every admin email).** The helper resolves the client name and brand, not each sender (Next `sendAdminEmail` `:186-188`). Client name: the owner membership's user (else the first membership's) first and last name, trimmed and joined, else full name, else `"Client"` (`resolveClientName` `:50-58`; column names from 2.1). Brand: `answers.brandName` (a non-empty trimmed string) of the project's latest brief by `version` (`extractBrandNameFromBriefAnswers`, `apps/web/src/lib/project-display-name.ts:1-9`; query `project-lifecycle-email.ts:91-95`), else the client's `name` trimmed, else `"Unknown brand"` (`resolveBrandName` `:68-72`; Next uses `??`, so a blank client name stays blank rather than falling through). Text body: the context line between intro and CTA (`:191`, `:195`); HTML intro: `"<intro> Client: <name>. Brand: <brand>."` (`:198`). → `LifecycleMailTest` (name fallbacks; brand from latest brief, client name, default) and `LifecycleMailRenderTest` (admin text and HTML).

## Inventory scope
- **X-18** (`01-feature-inventory.md:148`): fill Laravel/Tests; the row stays open until the feature stories call `sendOnce`. Destination already recorded as "Pest (email_sent markers, already_sent) — story 2.7" (`tests/parity/fixtures/laravel-only-destinations.json:18`).
- **DV-8** (`:179`), **NFR-R5** lifecycle half (`prd.md:128`), **N-14** (`:124`) base only: Laravel column notes; N-14 stays open for 4.4.
- **Ledger #100** (`test-port-ledger.md:108`, `project-lifecycle-email.test.ts`, 10 tests): port the dedupe/marker/skip cases here; the per-email content cases go to the feature stories. Mark the row partial.

## Next.js source read
`apps/web/src/lib/project-lifecycle-email.ts` (308 lines): `POSTMARK_API_URL` `:10`; result type `:12-15`; admin recipients `:17-22`; owner/name/email/brand resolution `:46-72`; project query `:74-98`; `alreadySent` `:100-103`; `markSent` `:105-107`; `sendEmail` `:109-140` (env `:110-111`, skip `:113-116`, parity URL override `:118`, stream `:131`, sanitised throw `:136-137`); `sendClientEmail` `:142-172` (marker only when `sent`, `:170`); `sendAdminEmail` `:174-207` (`:205`); the nine `notify*` exports `:209-308`. Callers: nine route files under `apps/web/src/app/api/` (e.g. `approve/route.ts:119-120`, `concepts/route.ts:348` with `.catch` → `notificationWarning`, `stripe/webhook/route.ts:203`). `apps/web/src/lib/email-branding.ts`: URL check `:11-20`, CTA normalisation `:37`, logo `:59-65`, `renderBrandedEmail` `:68`.

## Behaviour notes (written before converting)
- **Next order:** check marker → resolve recipient (skip if none) → send inline → write marker only if `sent`. A failed send throws to the route (`:137`) and leaves no marker, so repeating the action sends again. Check-then-act with no unique index: two concurrent calls can both send.
- **Next has no retry or backoff** (none in the file). Some routes catch the throw and report a `notificationWarning` (`concepts/route.ts:348`, `finals/route.ts:224-226`); others let it fail the request after the business write has committed (e.g. `revision-requests/route.ts:95`). DV-8 removes that: a transport failure can no longer reach the caller. The feature stories that port those routes must record the warning field's new meaning; not this story.
- **Decided elsewhere:** DV-8 (queued after commit, retries, same recipients/subjects/markers); ADR-018 (lifecycle queued `afterCommit`, marker-deduped, Postmark `outbound`); ADR-019 (`database` driver, `after_commit=true`, one worker).
- **Portal as built (`workbench/2-4-tx`):** no `app/Mail` or `app/Jobs`; `config/queue.php:16` default `database`, `:44` `after_commit => false`; `config/mail.php:17` default `log`, a `postmark` mailer entry exists (`:56-57`) with no stream set; Postmark packages not installed (AC 9). `Audit::record` writes on the runtime connection inside whatever transaction is open (`app/Support/Audit.php:13`, `:27-38`).

## Laravel guidance (for the dev agent)
- `app/Support/LifecycleMail.php` (`AGENTS.md` §7 *Helpers* row): dedupe, skip decisions, marker (per *Open questions* 1), dispatch.
- `app/Jobs/SendLifecycleMail.php`, `implements ShouldQueue, ShouldQueueAfterCommit`, `$tries = 4`, `backoff(): [10, 60, 300]`. It sends the mailable **synchronously inside the job** (`Mail::mailer('postmark')->to(...)->send(...)`), so there is one queue hop, and the job owns error sanitising (AC 7) and, if the owner picks Next's timing, the marker write after send. `app/Jobs/` is not in `AGENTS.md` §7: add the row in the same commit (`AGENTS.md` §5 *Docs* row).
- `app/Mail/LifecycleMail*.php` + `resources/views/mail/` (`AGENTS.md` §7 *Mailables* row).
- Markers through `Audit::record` only (`AGENTS.md` §5 *Audit* row), with the project id as a string, so no `AuditEvent` model is needed.
- Tests that call `sendOnce` inside `Db::serializable()` use the truncation harness, never `RefreshDatabase` (`AGENTS.md` §8, 2.4 gotcha), and disconnect after each test (§8).
- The `jobs` payload holds the serialised mailable (recipient, subject, body). That's normal for the database driver; don't put tokens or signed URLs in lifecycle mail (they have none today).

## Planned deviations from Next.js (confirm in the Conversion record)
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Send timing | inline in the route (`:157`) | queued job after commit | never block or undo the action | DV-8, ADR-018, ADR-019 |
| Retry | none | 4 tries, backoff 10/60/300 s | epic §2.7 | `epics.md:267`, *Open questions* 3 |
| Failure surface | throws to the route (`:137`) | logged + `failed_jobs`; caller already returned `sent` | DV-8 | DV-8 |
| `sent` meaning | Postmark accepted | queued | DV-8 | *Open questions* 4 |
| Marker timing | after a successful send (`:170`) | **OPEN** | duplicate window vs resend-after-failure | *Open questions* 1 |
| Transport | `fetch` to Postmark API | Symfony Postmark transport | Laravel mail | ADR-018 |

## Tasks
1. Composer packages (AC 9); config: `services.postmark`, mail from, stream, admin recipients; `queue.php` `after_commit` (AC 5, 8).
2. `LifecycleMail::sendOnce` + key builder + recipient and admin-context resolution (AC 1–4, 11).
3. Job + mailable + base layout (AC 5–7, 10).
4. Tests (below); ledger #100 partial; inventory columns.
5. Docs: Conversion record; `AGENTS.md` §7 `app/Jobs` row; §8 gotcha for the failed-jobs sanitising. **Do not edit ADR-018** (accepted; only the owner edits accepted ADRs, even though ADR-018:16 asks for consequences to be recorded "here"). If the marker timing or anything else adds a consequence, draft the note's text in the Conversion record *Open items* as an owner item (*Owner items* 3); the owner applies it or supersedes ADR-018 with a new ADR.

## Test plan
| Layer | File / title | IDs |
|---|---|---|
| L2 Pest | `tests/Feature/Mail/LifecycleMailTest.php`: results, key formats (dataset), dedupe, skips (no marker, no job) and their order, client and admin recipient resolution, admin client name and brand (AC 11) | X-18, N-04…N-12 keys |
| L2 Pest | `tests/Feature/Mail/LifecycleMailAfterCommitTest.php`: `database` connection; no job before commit; one job after; rollback leaves no job and no marker; serializable retry queues once | DV-8, ADR-019 |
| L2 Pest | `tests/Feature/Mail/LifecycleMailRetryTest.php`: throwing transport; `tries`/`backoff`; action rows survive; log line and `failed_jobs.exception` hold status only | X-18, NFR-R5 |
| L2 Pest | `tests/Feature/Mail/LifecycleMailRenderTest.php`: text and HTML bodies, admin context line (AC 11), footers, https rule, escaping | N-14 (base) |
| L2 Pest | `tests/Feature/Mail/LifecycleMailConfigTest.php`: `postmark` transport resolves with stream `outbound`; token/from from config | ADR-018 |
| L3 (optional) | `tests/Concurrency/LifecycleMailRaceTest.php`: two processes, one key, inside `Db::serializable()`. **Depends on *Open questions* 1:** under (a), one marker and one job; under (b), Next's timing, two jobs can both send, so the test asserts at most one marker and the record notes the duplicate window as accepted (or the test is dropped) | X-18 |
Ledger #100: dedupe and skip cases ported here; content cases left to the feature stories.

**Not run here:** real Postmark (no live sends; Postmark live-mode changes are owner-only); the parity `@email` journeys (they need the Next stack and the parity Mailpit/postmark-shim, brief §5).

## Definition of done (Laravel-only, `epics.md:35`)
Pest gate green plus the full Laravel suite (`bin/test`: Pint, Larastan, Pest). X-18 Laravel/Tests columns filled (row stays open); ledger #100 partial. Story record, handoff, pushed (branch); the record names the base branch chosen under *Open questions* 5.

## Dependencies and follow-ups
- **Depends on:** 2.4 (`Audit::record`, `Db::serializable`, the after-commit rule); 2.1 (`audit_events`, `jobs`, `failed_jobs`); 1.1a (queue and mail config). Recipient lookup reads clients, memberships and users (*Open questions* 5).
- **Follow-ups:** 4.4 replaces the minimal base with the branded one (logo). The feature stories call `sendOnce` from their Actions and port the per-email content tests. Epic 9 runs the supervised `queue:work` worker (ADR-019; owner/ops).

## Open questions (with recommendations)
1. **Marker timing. OPEN (owner decides: it changes observable behaviour).** Next writes the marker only after Postmark accepts (`:170`); the epic says `sendOnce` "checks and writes" it (`epics.md:267`). Options: (a) **at dispatch**, in the caller's transaction: a rollback leaves no marker, and inside `Db::serializable()` two concurrent actions can't both pass the check (serialisation failure, then `already_sent` on retry); but a job that exhausts its retries leaves a marker, so that email is never sent for that event, where Next would resend if the action were repeated. (b) **after send**, in the job (Next's timing): a failed email can be retried by repeating the action, but two jobs for one event can both send. *Recommendation:* (a), with permanent failures visible in `failed_jobs` and the log for the operator. This is the stronger "exactly-once-ish" (X-18) and matches the epic text.
2. **`after_commit`. Decided: `true` (ADR-019, accepted 2026-11-19).** `config/queue.php:44` says `false` today; this story sets it (AC 5). No owner action; the conflict is the skeleton default, not a disagreement with the ADR.
3. **Attempts.** The epic gives backoff only. *Recommendation:* `$tries = 4` (first try plus one retry per backoff value).
4. **What `sent` means.** *Recommendation:* queued. Callers today only branch on `skipped` (webhook, `finals/notify`), so this is safe; say it in the helper's docblock and the record.
5. **2.2 dependency and stack order. OPEN (owner decides).** The brief and epic put 2.7 after 2.4 only (brief §3, `epics.md:266`). Checked: `workbench/2-4-tx` does **not** contain 2.2 (it has only `app/Models/User.php`); 2.2 (`workbench/2-2-models`, status review) has `Project`, `Client`, `ClientMembership`, `Profile`, `AuditEvent`. Markers need no model (`Audit::record` takes a string id); recipient lookup reads `clients.billing_email`, memberships and `users.email`. Options: (a) branch from `workbench/2-4-tx` and merge `workbench/2-2-models` in (a trial `git merge-tree` shows conflicts only in `apps/portal/AGENTS.md`, `docs/governance/DECISIONS.md` and `RISKS.md`, all docs); (b) stack on 2.4 only and do the lookup with the query builder, switching to models when 2.2 merges. *Recommendation:* (a): the feature stories that call `sendOnce` will have models, and the doc conflicts are additive. The builder doesn't start on either option until the owner answers (see below).
6. **Postmark packages.** Resolved by reading: absent (AC 9). *Recommendation:* add them here; if no release meets the pin age, stop and ask (pin policy).
7. **`not_configured` in Laravel.** Next checks the token and from address only. *Recommendation:* `not_configured` when `mail.from.address` is empty, or when the lifecycle mailer is `postmark` and its token is empty, so dev (Mailpit/log) and tests (`array`) still exercise the path. Record as a deviation if the dev agent changes it.
8. **Gate tag.** Inventory X-18 says `@email` (`:148`); the epic and `laravel-only-destinations.json:18` say Pest. *Recommendation:* Pest here, as the epic; the inventory's `@email` stays for the later Laravel parity journeys.
9. **Parity Postmark shim.** Next points sends at the parity shim through `POSTMARK_API_URL` under `PARITY_MODE` (`:118`; `next-stack.mjs:37`). Laravel's transport always uses Postmark's host. *Recommendation:* not here; the story that adds Laravel `@email` journeys adds a parity-only host override. Note it as a follow-up in the record.

**Questions 1 and 5 block the start of 2.7.** The job's marker write, the L3 test and the base branch depend on them. Whether a builder may start the parts that don't (AC 8–10: packages, config, base layout) before the answers is the owner's call; without that answer, don't start.

## Owner items
1. Answer *Open questions* 1 (marker timing).
2. Answer *Open questions* 5 (base branch; option (a) means merging the unmerged `workbench/2-2-models` into 2.7's base).
3. After the build: the ADR-018 consequences note the builder drafts in the Conversion record (Task 5). Apply it to ADR-018 yourself, or supersede ADR-018 with a new ADR if it changes the decision.

## Doc / code disagreements and citation fixes
- **Critic review of `1894148`** (`reports/2-67-docs-critic-4915.md`): Task 5 no longer edits the accepted ADR-018 (owner item 3); the L3 race test is conditional on *Open questions* 1; Q5 no longer lets the builder start on (a) before the owner answers, and the start is marked blocked; the admin client-name/brand context is now AC 11; AC 4 fixes the order of checks.
- **Postmark env names:** `research-technical.md:230-232` calls `POSTMARK_API_KEY` the "correction" (Laravel's default name). AC 8 keeps Next's `POSTMARK_SERVER_TOKEN` and `POSTMARK_FROM` so the production env doesn't change on cutover. Both are defensible; the owner can overrule AC 8.
- **Stack base:** draft said "Stacks on `workbench/2-4-tx`"; header now in the critic's form, and states that 2.4 lacks 2.2 (checked, not assumed). Draft OQ 5 asked to "check whether 2.4 includes 2.2": it doesn't.
- **AGENTS.md citations** name section and row (§4 pins, §5 *Config*/*Audit*/*Docs*, §7 *Helpers*/*Mailables*, §8 gotchas) instead of "AGENTS §5".
- **Postmark package** (draft OQ 6, unverified): absent; now AC 9. **Admin env name** (draft OQ 8, unverified): confirmed `ADMIN_NOTIFICATION_EMAILS` in `project-lifecycle-email.ts:18` (not `email-branding.ts`, which the draft pointed to). **Mailable afterCommit** (unverified): checked in the vendored framework: `SendQueuedMailable` takes `afterCommit` from the mailable or `ShouldQueueAfterCommit`; `Queue::shouldDispatchAfterCommit` falls back to the connection's `after_commit`. AC 5 uses both.
- Draft's design queued a mailable **and** a job; now one job sending synchronously inside it (one hop, and the job can sanitise errors). Draft didn't notice that Symfony's exception text, stored in `failed_jobs.exception`, would leak the provider body; now AC 7.
- Draft AC 4 ("`Queue::fake` doesn't model `after_commit`") kept, but the test must also force the `database` connection: `phpunit.xml:38` sets `QUEUE_CONNECTION=sync`.
- Line fixes: env vars `:110-111` (draft `:112-113`); N-14 CTA rule is `business-rules-and-notifications.md:60` (draft cited `:124`, which is the inventory's N-14 row); ledger #100 is `test-port-ledger.md:108` (draft `:100`); `sendClientEmail` ends `:172` (draft `:170`); recipient resolution is `:60-66`, called at `:153`.
- Added from reading the callers: skips must stay synchronous because the webhook and `finals/notify` branch on them (AC 4); the keyless final-deliverables marker (AC 2); Next's loopback-http allowance (AC 10).
- Draft listed "Mailpit" for the parity journeys; the parity stack uses a postmark-shim in front of Mailpit (`tests/parity/infra/docker-compose.test.yml:84-93`). Both named now.

---

## Conversion record
(Filled in by the dev agent; see `templates/story-conversion-record.md`. Write "none" rather than leaving a section out.)

### Laravel implementation

### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|

Test-port ledger rows resolved:

### Test evidence
**Not run, and why:**

### Gotchas

### Docs updated

### Open items

### Built (2026-11-22, builder 2-7-mail)

Branch `workbench/2-7-mail`, base `origin/workbench/2-4-tx`; also merged `origin/workbench/2-2-models` (needed for Project/membership/Client/Profile/AuditEvent). Docs conflicts in AGENTS.md, DECISIONS.md, RISKS.md, handoff.md were resolved by keeping both sides.

- `App\Support\LifecycleMail::sendOnce(type, projectId, key, LifecycleMessage)` → `LifecycleMailResult` (`sent` = queued, `already_sent`, `skipped` + `missing_recipient`|`not_configured`). Order marker → recipient → configuration, as Next. Marker via `Audit::record`, null actor, `{}` payload, in the caller's transaction (Q1 built as recommended, awaiting owner). Q5 base 2-4-tx, built as recommended, awaiting owner.
- `App\Jobs\SendLifecycleMail` (4 tries, backoff 10/60/300, `ShouldQueueAfterCommit`), `App\Mail\LifecycleMailable`, `resources/views/mail/layouts/base*.blade.php` (minimal; 4.4 brands it). Failures are rethrown as `Postmark send failed (<status>)`.
- Composer: `symfony/postmark-mailer ^8.1` (v8.1.6), `symfony/http-client ^8.1` (v8.1.11; `composer audit` clean). Config: `services.postmark.token` ← `POSTMARK_SERVER_TOKEN`, mail from ← `POSTMARK_FROM` else `MAIL_FROM_ADDRESS`, stream `outbound`, `queue.database.after_commit=true`.
- Tests: `tests/Feature/Mail/*` (29). Full `bin/test`: 566 passed, Pint and Larastan clean.
- Not done: no live Postmark send; no deploy; ADR-018 untouched.

### Open items
- Owner: apply the ADR-018 note (or supersede): "Lifecycle mail uses `symfony/postmark-mailer` through Laravel's queue with `after_commit`; the `email_sent:*` marker is written at dispatch, so `sent` means queued and exhausted retries land in `failed_jobs` without a resend. Env names POSTMARK_SERVER_TOKEN / POSTMARK_FROM are kept from Next."

