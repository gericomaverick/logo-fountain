-- Seed facts wrapper for the Laravel portal schema (story 2.6). Defines the f_* views seed-facts.sql reads.
-- Temporary views: run as the schema owner (portal_migrate owns the database, so it may create them).
CREATE TEMPORARY VIEW f_user AS
  SELECT id, email_verified_at IS NOT NULL AS verified, password IS NOT NULL AS has_password FROM users;
CREATE TEMPORARY VIEW f_profile AS SELECT id, is_admin FROM profiles;
CREATE TEMPORARY VIEW f_admin_bootstrap AS SELECT user_id FROM auth_admin_bootstrap;
CREATE TEMPORARY VIEW f_project AS SELECT id, status FROM projects;
CREATE TEMPORARY VIEW f_membership AS
  SELECT p.id AS project_id, m.user_id FROM client_memberships m JOIN projects p ON p.client_id = m.client_id;
CREATE TEMPORARY VIEW f_state_change AS
  SELECT project_id, payload->>'previousStatus' AS previous_status, payload->>'nextStatus' AS next_status,
         actor_id, created_at AS at, id
  FROM audit_events WHERE type = 'state_changed';
CREATE TEMPORARY VIEW f_entitlement AS
  SELECT project_id, key, limit_int, consumed_int, reserved_int FROM project_entitlements;
CREATE TEMPORARY VIEW f_order AS SELECT project_id, status, total_cents FROM project_orders;
CREATE TEMPORARY VIEW f_brief AS SELECT project_id FROM project_briefs;
CREATE TEMPORARY VIEW f_brief_draft AS SELECT project_id FROM project_brief_drafts;
CREATE TEMPORARY VIEW f_concept AS SELECT project_id, number, status FROM concepts;
CREATE TEMPORARY VIEW f_file_asset AS SELECT project_id, kind FROM file_assets;
CREATE TEMPORARY VIEW f_revision AS SELECT project_id, status FROM revision_requests;
CREATE TEMPORARY VIEW f_comment AS SELECT project_id FROM concept_comments;
CREATE TEMPORARY VIEW f_message AS SELECT project_id, kind, created_at AS at, id FROM messages;
