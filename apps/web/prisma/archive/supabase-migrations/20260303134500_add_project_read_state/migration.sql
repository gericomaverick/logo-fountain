-- CreateTable
CREATE TABLE "ProjectReadState" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "lastSeenMessagesAt" TIMESTAMP(3),
  "lastSeenConceptsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectReadState_userId_projectId_key" ON "ProjectReadState"("userId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectReadState_projectId_idx" ON "ProjectReadState"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectReadState" ADD CONSTRAINT "ProjectReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReadState" ADD CONSTRAINT "ProjectReadState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
