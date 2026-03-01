# Logo Fountain — DB Schema Proposal v1.0 (Supabase/Postgres + Prisma)

**Date:** 2026-03-01

This is the initial schema proposal aligned with:
- `docs/rls-matrix-v1.0.md`
- `docs/stripe-state-machine-v1.0.md`
- Option B entitlements
- Campaign landing pages (P1)

---

## 1) Core tables (P0)
### `profiles`
- `id uuid pk` (auth.users.id)
- `email text`
- `full_name text null`
- `is_admin boolean default false`
- timestamps

### `clients`
- `id uuid pk`
- `name text`
- `slug text unique`
- `billing_email text null`
- `vat_number text null`
- timestamps

### `client_memberships`
- `id uuid pk`
- `client_id uuid fk clients`
- `user_id uuid fk profiles`
- `role text` (`owner|admin|designer|viewer`)
- unique `(client_id,user_id)`

### `projects`
- `id uuid pk`
- `client_id uuid fk clients`
- `status text` (state machine)
- `package_code text` (denormalized)
- timestamps

### `project_orders`
- `id uuid pk`
- `project_id uuid fk projects`
- `client_id uuid fk clients`
- `status text` (`pending_payment|paid|fulfilled|...`)
- `currency text`
- `total_cents int`
- `stripe_checkout_session_id text unique null`
- `stripe_payment_intent_id text unique null`
- `campaign_slug text null`
- timestamps

### `project_entitlements`
- `id uuid pk`
- `project_id uuid fk projects`
- `key text` (e.g. `concepts`, `revisions`)
- `limit_int int null`
- `consumed_int int default 0`
- unique `(project_id,key)`

### `project_briefs`
- `id uuid pk`
- `project_id uuid fk projects`
- `version int`
- `answers jsonb`
- `created_by uuid fk profiles`
- unique `(project_id,version)`

### `concepts`
- `id uuid pk`
- `project_id uuid fk projects`
- `number int`
- `status text` (`draft|published|approved|archived`)
- `notes text null`
- unique `(project_id,number)`

### `revision_requests`
- `id uuid pk`
- `project_id uuid fk projects`
- `concept_id uuid fk concepts`
- `status text` (`requested|in_progress|delivered|closed`)
- `requested_by uuid fk profiles`
- `body text`
- timestamps

### `message_threads`
- `id uuid pk`
- `project_id uuid fk projects`

### `messages`
- `id uuid pk`
- `thread_id uuid fk message_threads`
- `project_id uuid fk projects`
- `sender_id uuid fk profiles`
- `body text`
- `kind text default 'text'`
- timestamps

### `file_assets`
- `id uuid pk`
- `project_id uuid fk projects`
- `kind text`
- `bucket text`
- `path text`
- `mime text`
- `size int`
- `uploaded_by uuid fk profiles`
- timestamps

### `audit_events`
- `id uuid pk`
- `project_id uuid fk projects null`
- `actor_id uuid fk profiles null`
- `type text`
- `payload jsonb`
- `created_at timestamptz`

### `stripe_events`
- `event_id text pk`
- `type text`
- `created_at timestamptz`
- `processed_at timestamptz`

---

## 2) P1 tables
### `campaign_pages`
See `docs/campaign-landing-pages-v1.0.md`.

---

## 3) Notes
- `packages/addons` can start as config constants + server allowlist; promote to tables later if needed.
- Ensure `revision_requests` creation calls an RPC that also increments `project_entitlements(consumed)`.
