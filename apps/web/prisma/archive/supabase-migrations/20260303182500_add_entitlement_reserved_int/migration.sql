-- Add reservedInt to support reserving revisions on request and consuming on delivery.
ALTER TABLE "ProjectEntitlement"
ADD COLUMN IF NOT EXISTS "reservedInt" INTEGER NOT NULL DEFAULT 0;
