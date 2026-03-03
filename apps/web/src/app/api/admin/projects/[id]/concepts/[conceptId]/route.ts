import { jsonError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; conceptId: string }> },
) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId, conceptId } = await params;

    const concept = await prisma.concept.findFirst({
      where: { id: conceptId, projectId },
      select: { id: true, number: true, status: true },
    });

    if (!concept) {
      return jsonError("Concept not found", 404, { nextStep: "Check the concept link." }, "CONCEPT_NOT_FOUND");
    }

    const wasPublished = concept.status === "published" || concept.status === "approved";

    await prisma.$transaction(async (tx) => {
      await tx.concept.update({
        where: { id: concept.id },
        data: { status: "deleted" },
      });

      // If there are revision requests tied to this concept, remove them.
      // (Concept deletion is a destructive admin action; for testing/reset flows we want a clean slate.)
      const revisionRequestsToDelete = await tx.revisionRequest.findMany({
        where: { projectId, conceptId: concept.id },
        select: { id: true, status: true },
      });

      const deletedRevisionRequests = await tx.revisionRequest.deleteMany({
        where: { projectId, conceptId: concept.id },
      });

      if (wasPublished) {
        await tx.$executeRaw`
          UPDATE "ProjectEntitlement"
          SET "consumedInt" = GREATEST(COALESCE("consumedInt", 0) - 1, 0),
              "updatedAt" = NOW()
          WHERE "projectId" = ${projectId}::uuid
            AND "key" = 'concepts'
        `;
      }

      if (deletedRevisionRequests.count > 0) {
        // If we deleted revision requests due to concept deletion, also refund the consumed revisions.
        await tx.$executeRaw`
          UPDATE "ProjectEntitlement"
          SET "consumedInt" = GREATEST(COALESCE("consumedInt", 0) - ${deletedRevisionRequests.count}, 0),
              "updatedAt" = NOW()
          WHERE "projectId" = ${projectId}::uuid
            AND "key" = 'revisions'
        `;
      }

      await logAudit(tx, {
        projectId,
        actorId: user.id,
        type: "concept_deleted",
        payload: {
          conceptId: concept.id,
          conceptNumber: concept.number,
          previousStatus: concept.status,
          deletedRevisionRequests: deletedRevisionRequests.count,
          deletedRevisionRequestIds: revisionRequestsToDelete.map((r) => r.id),
        },
      });
    });

    return Response.json({ ok: true });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
