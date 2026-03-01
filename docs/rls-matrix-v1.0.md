# Logo Fountain — RLS Matrix v1.0 (Supabase)

**Date:** 2026-03-01

Goal: table-by-table access rules. This is the pre-dev spec to implement as Postgres RLS policies (default deny).

Roles in this matrix:
- **ClientMember**: authenticated user with membership in a `client` that owns the project.
- **AdminUser**: operator/designer (service) user.
- **ServiceRole**: Supabase service key context (webhooks, secure server jobs).

Notes:
- Prefer **RPC (`security definer`)** for sensitive mutations (entitlement consumption, order fulfillment) instead of direct table `update` from client.
- All writes should emit `audit_events` (either via triggers or application-layer calls).

---

## Membership helpers
- `is_client_member(client_id)`
- `is_project_member(project_id)` (via projects.client_id)
- `is_admin()` (e.g., `profiles.is_admin = true` OR membership role)

---

## Matrix

### `profiles`
- Select: self only (ClientMember), all (AdminUser)
- Insert: via auth trigger only
- Update: self (name/avatar), admin can update admin-only fields

### `clients`
- Select: members of client; admin all
- Insert: authenticated user (creates client + membership via RPC)
- Update: owner/admin of client; admin all

### `client_memberships`
- Select: members of client; admin all
- Insert/Update/Delete: client owner/admin; admin all

### `projects`
- Select: project members; admin all
- Insert: ClientMember (on successful payment fulfillment, likely ServiceRole/RPC)
- Update:
  - ClientMember: limited fields (e.g., project display name optional)
  - AdminUser: state transitions, assignments, due dates
  - ServiceRole: fulfillment linking

### `packages`, `package_entitlements`
- Select: public or authenticated (recommend public for marketing page)
- Insert/Update/Delete: AdminUser only

### `addons`, `addon_entitlements`
- Select: public/authenticated
- Insert/Update/Delete: AdminUser only

### `project_orders`, `project_order_addons`
- Select: project members (read-only); admin all
- Insert:
  - order creation via server API (ClientMember indirectly)
  - webhook fulfillment via ServiceRole
- Update: **ServiceRole only** (status changes, stripe ids)

### `project_entitlements`
- Select: project members; admin all
- Insert: ServiceRole only (on fulfillment)
- Update:
  - `consumed_int`: **RPC/ServiceRole only** (revision request creation consumes)
  - `limit_int`: ServiceRole only (upgrades/add-ons), AdminUser via override RPC

### `project_briefs`
- Select: project members; admin all
- Insert: ClientMember (new version)
- Update/Delete: disallow (append-only versions); admin may redact via special action (P1)

### `concepts`
- Select: project members **only for published/shared concepts**; admin all
- Insert/Update: AdminUser

### `revisions` / `revision_requests`
- Select: project members; admin all
- Insert: ClientMember (request) and AdminUser (fulfillment)
- Update: AdminUser (status), ServiceRole (entitlement consume via RPC)

### `message_threads`, `messages`
- Select: project members; admin all
- Insert: project members (sender_id = auth.uid()), admin all
- Update/Delete: disallow edits for clients (append-only); admin moderation P1

### `file_assets`
- Select: project members; admin all
- Insert: AdminUser for concept/final; ClientMember for brief assets
- Update/Delete: AdminUser only

### `audit_events`
- Select: admin all; clients see limited subset (state changes, deliveries) via view
- Insert: ServiceRole/AdminUser only (or via trigger)
- Update/Delete: never

### `stripe_events`
- Select: ServiceRole/AdminUser only
- Insert: ServiceRole only
- Update/Delete: never
