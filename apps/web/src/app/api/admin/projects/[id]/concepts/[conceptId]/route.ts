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

    await prisma.$transaction(async (tx) => {
      const concept = await tx.concept.findFirst({ where: { id: conceptId, projectId }, select: { id: true, number: true, status: true } });
      if (!concept) throw new Error("CONCEPT_NOT_FOUND");
      if (concept.status === "deleted") return;
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { status: true, updatedAt: true } });
      if (!project || !["BRIEF_SUBMITTED", "IN_DESIGN", "CONCEPTS_READY"].includes(project.status) || concept.status === "approved") throw new Error("CONCEPT_DELETE_PHASE_GUARD");
      if (project.status === "CONCEPTS_READY" && ["published", "approved"].includes(concept.status)) {
        const otherVisible = await tx.concept.count({ where: { projectId, id: { not: concept.id }, status: { in: ["published", "approved"] } } });
        if (!otherVisible) throw new Error("CONCEPT_DELETE_PHASE_GUARD");
      }
      const projectGuard = await tx.project.updateMany({ where: { id: projectId, status: project.status, updatedAt: project.updatedAt }, data: { updatedAt: new Date() } });
      if (projectGuard.count !== 1) throw new Error("CONCEPT_DELETE_CONFLICT");
      // Deletion never rewinds consumed usage, including delivered revisions.
      // A clean-slate reset is the only supported usage rewind.
      const changed = await tx.concept.updateMany({ where: { id: concept.id, projectId, status: concept.status }, data: { status: "deleted" } });
      if (changed.count !== 1) throw new Error("CONCEPT_DELETE_CONFLICT");

      // If there are revision requests tied to this concept, remove them.
      // This is not a clean-slate usage reset.
      const revisionRequestsToDelete = await tx.revisionRequest.findMany({
        where: { projectId, conceptId: concept.id },
        select: { id: true, status: true },
      });

      const deletedRevisionRequests = await tx.revisionRequest.deleteMany({
        where: { projectId, conceptId: concept.id },
      });

      if (deletedRevisionRequests.count > 0) {
        const requestedCount = revisionRequestsToDelete.filter((r) => r.status !== "delivered").length;

        // Release only reservations cancelled by deletion; delivered usage is durable.
        await tx.$executeRaw`
          UPDATE "ProjectEntitlement"
          SET "reservedInt" = GREATEST(COALESCE("reservedInt", 0) - ${requestedCount}, 0),
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
    }, { isolationLevel: "Serializable" });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "CONCEPT_DELETE_PHASE_GUARD") return jsonError("Deletion would invalidate the current phase or approval; use an explicit clean-slate reset for a complete restart", 409, undefined, "CONCEPT_DELETE_PHASE_GUARD");
    if (error instanceof Error && error.message === "CONCEPT_NOT_FOUND") return jsonError("Concept not found", 404, undefined, "CONCEPT_NOT_FOUND");
    if (error instanceof Error && error.message === "CONCEPT_DELETE_CONFLICT") return jsonError("Concept changed; refresh before retrying", 409, undefined, "CONCEPT_DELETE_CONFLICT");
    if (typeof error === "object" && error !== null && "code" in error && ["P2034", "P2028"].includes(String(error.code))) return jsonError("Concurrent lifecycle change; refresh before retrying", 409, undefined, "LIFECYCLE_CONFLICT");
    return toRouteErrorResponse(error);
  }
}
