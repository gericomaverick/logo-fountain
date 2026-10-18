-- A brief in progress, held server-side so a customer can start it on a phone
-- and finish on a laptop. One row per project, replaced as they edit and
-- removed once they submit: submitted briefs remain the immutable versioned
-- records in "ProjectBrief".
--
-- Runtime access comes from the ALTER DEFAULT PRIVILEGES in
-- ops/postgres/runtime-grants.sql, so lf_runtime can use this table without a
-- further grant. This is not an operator table and must not be revoked.

-- CreateTable
CREATE TABLE "ProjectBriefDraft" (
    "projectId" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "updatedBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBriefDraft_pkey" PRIMARY KEY ("projectId")
);

-- CreateIndex
CREATE INDEX "ProjectBriefDraft_updatedBy_idx" ON "ProjectBriefDraft"("updatedBy");

-- AddForeignKey
ALTER TABLE "ProjectBriefDraft" ADD CONSTRAINT "ProjectBriefDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBriefDraft" ADD CONSTRAINT "ProjectBriefDraft_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
