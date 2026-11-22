-- Seed facts wrapper for the Next.js (Prisma) schema (story 2.6). Defines the f_* views seed-facts.sql reads.
-- Temporary views: run as lf_migrate, which owns lf_parity (tests/parity/infra/postgres/init/10-parity.sh).
-- Not run by the 2.6 builder (no Next stack): the owner's comparison, story 2.6 Conversion record, Owner items.
CREATE TEMPORARY VIEW f_user AS
  SELECT u.id, u."emailVerified" AS verified,
         EXISTS (SELECT 1 FROM "AuthAccount" a WHERE a."userId" = u.id AND a."providerId" = 'credential' AND a.password IS NOT NULL) AS has_password
  FROM "AuthUser" u;
CREATE TEMPORARY VIEW f_profile AS SELECT id, "isAdmin" AS is_admin FROM "Profile";
CREATE TEMPORARY VIEW f_admin_bootstrap AS SELECT "userId" AS user_id FROM "AuthAdminBootstrap";
CREATE TEMPORARY VIEW f_project AS SELECT id, status FROM "Project";
CREATE TEMPORARY VIEW f_membership AS
  SELECT p.id AS project_id, m."userId" AS user_id FROM "ClientMembership" m JOIN "Project" p ON p."clientId" = m."clientId";
CREATE TEMPORARY VIEW f_state_change AS
  SELECT "projectId" AS project_id, payload->>'previousStatus' AS previous_status, payload->>'nextStatus' AS next_status,
         "actorId" AS actor_id, "createdAt" AS at, id
  FROM "AuditEvent" WHERE type = 'state_changed';
CREATE TEMPORARY VIEW f_entitlement AS
  SELECT "projectId" AS project_id, key, "limitInt" AS limit_int, "consumedInt" AS consumed_int, "reservedInt" AS reserved_int
  FROM "ProjectEntitlement";
CREATE TEMPORARY VIEW f_order AS SELECT "projectId" AS project_id, status, "totalCents" AS total_cents FROM "ProjectOrder";
CREATE TEMPORARY VIEW f_brief AS SELECT "projectId" AS project_id FROM "ProjectBrief";
CREATE TEMPORARY VIEW f_brief_draft AS SELECT "projectId" AS project_id FROM "ProjectBriefDraft";
CREATE TEMPORARY VIEW f_concept AS SELECT "projectId" AS project_id, number, status FROM "Concept";
CREATE TEMPORARY VIEW f_file_asset AS SELECT "projectId" AS project_id, kind FROM "FileAsset";
CREATE TEMPORARY VIEW f_revision AS SELECT "projectId" AS project_id, status FROM "RevisionRequest";
CREATE TEMPORARY VIEW f_comment AS SELECT "projectId" AS project_id FROM "ConceptComment";
CREATE TEMPORARY VIEW f_message AS SELECT "projectId" AS project_id, kind, "createdAt" AS at, id FROM "Message";
