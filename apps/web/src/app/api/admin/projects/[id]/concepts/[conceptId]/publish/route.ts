import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { createProjectSystemMessage } from "@/lib/system-messages";
import { notifyClientConceptReady } from "@/lib/project-lifecycle-email";
import { ConceptEntitlementError, consumeConceptEntitlement } from "@/lib/concept-entitlement";

export const runtime = "nodejs";

const PROJECT_STATUS_CONCEPTS_READY = "CONCEPTS_READY";

function isTransactionConflict(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
  return code === "P2034" || code === "P2028";
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; conceptId: string }> },
) {
  try {
    const user = await requireUser();
    await requireAdmin(user);
    const { id: projectId, conceptId } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const concept = await tx.concept.findFirst({
        where: { id: conceptId, projectId },
        select: { id: true, number: true, status: true },
      });
      if (!concept) throw new Error("CONCEPT_NOT_FOUND");

      // Publishing is idempotent. In particular, retries never consume a
      // second slot. Approved concepts must never be downgraded to published.
      if (concept.status === "published") {
        return { concept, projectStatus: null, publishedNow: false };
      }
      if (concept.status !== "draft") throw new Error("CONCEPT_NOT_PUBLISHABLE");

      const project = await tx.project.findUnique({ where: { id: projectId }, select: { status: true } });
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      if (!["BRIEF_SUBMITTED", "IN_DESIGN", "CONCEPTS_READY"].includes(project.status)) {
        throw new Error("INVALID_PROJECT_STATUS_TRANSITION");
      }
      const visibleCount = await tx.concept.count({
        where: { projectId, status: { in: ["published", "approved"] }, id: { not: conceptId } },
      });
      if (visibleCount === 0 && project.status !== PROJECT_STATUS_CONCEPTS_READY) {
        const transition = applyTransition(project.status, PROJECT_STATUS_CONCEPTS_READY);
        if (!transition.ok) throw new Error("INVALID_PROJECT_STATUS_TRANSITION");
      }

      const entitlement = await consumeConceptEntitlement(tx, projectId);
      const changed = await tx.concept.updateMany({
        where: { id: conceptId, projectId, status: "draft" },
        data: { status: "published" },
      });
      if (changed.count !== 1) throw new Error("CONCEPT_PUBLICATION_CONFLICT");

      const updatedConcept = { id: concept.id, number: concept.number, status: "published" };
      await logAudit(tx, {
        projectId,
        actorId: user.id,
        type: "entitlement_consumed",
        payload: { key: "concepts", after: entitlement, reason: "admin_concept_publish", conceptId },
      });
      await logAudit(tx, {
        projectId,
        actorId: user.id,
        type: "concept_published",
        payload: { conceptId },
      });
      await createProjectSystemMessage(tx, {
        projectId,
        fallbackUserId: user.id,
        body: `Concept ${concept.number} is ready for review.`,
      });

      let projectStatus: string | null = null;
      if (visibleCount === 0 && project.status !== PROJECT_STATUS_CONCEPTS_READY) {
        const updated = await tx.project.update({
          where: { id: projectId },
          data: { status: PROJECT_STATUS_CONCEPTS_READY },
          select: { status: true },
        });
        projectStatus = updated.status;
        await logAudit(tx, {
          projectId,
          actorId: user.id,
          type: "state_changed",
          payload: { previousStatus: project.status, nextStatus: PROJECT_STATUS_CONCEPTS_READY },
        });
      }
      return { concept: updatedConcept, projectStatus, publishedNow: true };
    }, { isolationLevel: "Serializable", maxWait: 2_000, timeout: 5_000 });

    if (result.publishedNow) await notifyClientConceptReady(projectId, result.concept.id);
    return Response.json({ ok: true, concept: result.concept, projectStatus: result.projectStatus });
  } catch (error) {
    if (error instanceof ConceptEntitlementError) {
      const missing = error.code === "CONCEPTS_ENTITLEMENT_MISSING";
      return jsonError(
        missing ? "Concept entitlement not configured" : "Concept entitlement exhausted",
        400,
        { nextStep: "Set an appropriate concept entitlement with an audited override before publishing." },
        error.code,
      );
    }
    if (error instanceof Error && error.message === "CONCEPT_NOT_FOUND") return jsonError("Concept not found", 404, undefined, "CONCEPT_NOT_FOUND");
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");
    if (error instanceof Error && error.message === "CONCEPT_NOT_PUBLISHABLE") return jsonError("Only draft concepts can be published", 409, undefined, "CONCEPT_NOT_PUBLISHABLE");
    if (error instanceof Error && error.message === "INVALID_PROJECT_STATUS_TRANSITION") return jsonError("Project state does not allow concept publication", 400, undefined, "INVALID_PROJECT_STATUS_TRANSITION");
    if ((error instanceof Error && error.message === "CONCEPT_PUBLICATION_CONFLICT") || isTransactionConflict(error)) {
      return jsonError("Concept publication changed concurrently; refresh before retrying", 409, undefined, "CONCEPT_PUBLICATION_CONFLICT");
    }
    return toRouteErrorResponse(error);
  }
}
