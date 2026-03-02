-- CreateTable
CREATE TABLE "RevisionRequest" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "conceptId" UUID,
    "status" TEXT NOT NULL,
    "requestedBy" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevisionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevisionRequest_projectId_idx" ON "RevisionRequest"("projectId");

-- CreateIndex
CREATE INDEX "RevisionRequest_conceptId_idx" ON "RevisionRequest"("conceptId");

-- CreateIndex
CREATE INDEX "RevisionRequest_requestedBy_idx" ON "RevisionRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "RevisionRequest_status_idx" ON "RevisionRequest"("status");

-- AddForeignKey
ALTER TABLE "RevisionRequest" ADD CONSTRAINT "RevisionRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionRequest" ADD CONSTRAINT "RevisionRequest_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionRequest" ADD CONSTRAINT "RevisionRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
