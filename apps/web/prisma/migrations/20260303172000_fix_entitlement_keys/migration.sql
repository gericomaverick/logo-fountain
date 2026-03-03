-- Fix entitlement key mismatch introduced during checkout fulfillment.
-- Canonical keys across the app: 'concepts' and 'revisions'.
-- Legacy keys: 'concepts_allowed' and 'revisions_allowed'.

-- Merge legacy concepts_allowed into concepts when both exist.
WITH pairs AS (
  SELECT
    "projectId",
    MAX(CASE WHEN key = 'concepts' THEN id::text END)::uuid AS new_id,
    MAX(CASE WHEN key = 'concepts_allowed' THEN id::text END)::uuid AS old_id
  FROM "ProjectEntitlement"
  WHERE key IN ('concepts', 'concepts_allowed')
  GROUP BY "projectId"
)
UPDATE "ProjectEntitlement" AS new
SET
  "limitInt" = GREATEST(COALESCE(new."limitInt", 0), COALESCE(old."limitInt", 0)),
  "consumedInt" = GREATEST(COALESCE(new."consumedInt", 0), COALESCE(old."consumedInt", 0)),
  "updatedAt" = NOW()
FROM pairs p
JOIN "ProjectEntitlement" AS old ON old.id = p.old_id
WHERE new.id = p.new_id
  AND p.new_id IS NOT NULL
  AND p.old_id IS NOT NULL;

WITH pairs AS (
  SELECT
    "projectId",
    MAX(CASE WHEN key = 'concepts' THEN id::text END)::uuid AS new_id,
    MAX(CASE WHEN key = 'concepts_allowed' THEN id::text END)::uuid AS old_id
  FROM "ProjectEntitlement"
  WHERE key IN ('concepts', 'concepts_allowed')
  GROUP BY "projectId"
)
DELETE FROM "ProjectEntitlement"
WHERE id IN (
  SELECT old_id FROM pairs WHERE new_id IS NOT NULL AND old_id IS NOT NULL
);

-- Rename remaining legacy concepts_allowed -> concepts.
UPDATE "ProjectEntitlement"
SET key = 'concepts', "updatedAt" = NOW()
WHERE key = 'concepts_allowed';

-- Merge legacy revisions_allowed into revisions when both exist.
WITH pairs AS (
  SELECT
    "projectId",
    MAX(CASE WHEN key = 'revisions' THEN id::text END)::uuid AS new_id,
    MAX(CASE WHEN key = 'revisions_allowed' THEN id::text END)::uuid AS old_id
  FROM "ProjectEntitlement"
  WHERE key IN ('revisions', 'revisions_allowed')
  GROUP BY "projectId"
)
UPDATE "ProjectEntitlement" AS new
SET
  "limitInt" = GREATEST(COALESCE(new."limitInt", 0), COALESCE(old."limitInt", 0)),
  "consumedInt" = GREATEST(COALESCE(new."consumedInt", 0), COALESCE(old."consumedInt", 0)),
  "updatedAt" = NOW()
FROM pairs p
JOIN "ProjectEntitlement" AS old ON old.id = p.old_id
WHERE new.id = p.new_id
  AND p.new_id IS NOT NULL
  AND p.old_id IS NOT NULL;

WITH pairs AS (
  SELECT
    "projectId",
    MAX(CASE WHEN key = 'revisions' THEN id::text END)::uuid AS new_id,
    MAX(CASE WHEN key = 'revisions_allowed' THEN id::text END)::uuid AS old_id
  FROM "ProjectEntitlement"
  WHERE key IN ('revisions', 'revisions_allowed')
  GROUP BY "projectId"
)
DELETE FROM "ProjectEntitlement"
WHERE id IN (
  SELECT old_id FROM pairs WHERE new_id IS NOT NULL AND old_id IS NOT NULL
);

-- Rename remaining legacy revisions_allowed -> revisions.
UPDATE "ProjectEntitlement"
SET key = 'revisions', "updatedAt" = NOW()
WHERE key = 'revisions_allowed';
