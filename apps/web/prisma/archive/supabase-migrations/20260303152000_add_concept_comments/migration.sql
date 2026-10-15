CREATE TABLE "ConceptComment" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "conceptId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConceptComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConceptComment_projectId_createdAt_idx" ON "ConceptComment"("projectId", "createdAt");
CREATE INDEX "ConceptComment_conceptId_createdAt_idx" ON "ConceptComment"("conceptId", "createdAt");
CREATE INDEX "ConceptComment_authorId_idx" ON "ConceptComment"("authorId");

ALTER TABLE "ConceptComment"
  ADD CONSTRAINT "ConceptComment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptComment"
  ADD CONSTRAINT "ConceptComment_conceptId_fkey"
  FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptComment"
  ADD CONSTRAINT "ConceptComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
