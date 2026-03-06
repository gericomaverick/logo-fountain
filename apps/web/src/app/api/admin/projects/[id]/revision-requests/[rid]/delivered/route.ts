import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { createProjectSystemMessage } from "@/lib/system-messages";
import { notifyClientRevisionReady } from "@/lib/project-lifecycle-email";

export const runtime = "nodejs";

const STATUS_DELIVERED = "delivered";
const PROJECT_STATUS_CONCEPTS_READY = "CONCEPTS_READY";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; rid: string }> },
) {
  try {
  const user = await requireUser();
  await requireAdmin(user);

  const { id: projectId, rid } = await params;
  const payload = (await req.json().catch(() => null)) as { setConceptsReady?: boolean } | null;
  const setConceptsReady = payload?.setConceptsReady !== false;

  const revisionRequest = await prisma.revisionRequest.findFirst({
    where: { id: rid, projectId },
    select: { id: true, status: true },
  });

  if (!revisionRequest) {
    return jsonError("Revision request not found", 404, undefined, "REVISION_REQUEST_NOT_FOUND");
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
  if (!project) {
    return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");
  }

  if (setConceptsReady) {
    const transition = applyTransition(project.status, PROJECT_STATUS_CONCEPTS_READY);
    if (!transition.ok) {
      return jsonError(
        `Invalid transition from ${project.status} to ${PROJECT_STATUS_CONCEPTS_READY}`,
        400,
        { allowed: transition.allowed },
        "INVALID_PROJECT_STATUS_TRANSITION",
      );
    }
  }

  const previousStatus = project.status;

  const result = await prisma.$transaction(async (tx) => {
    let deliveredNow = false;

    if (revisionRequest.status !== STATUS_DELIVERED) {
      const revisionsEntitlement = await tx.projectEntitlement.findFirst({
        where: { projectId, key: "revisions" },
        select: { id: true, limitInt: true, consumedInt: true, reservedInt: true },
      });

      if (!revisionsEntitlement) {
        throw new Error("REVISIONS_ENTITLEMENT_MISSING");
      }

      const consumed = Math.max(revisionsEntitlement.consumedInt ?? 0, 0);
      const reserved = Math.max(revisionsEntitlement.reservedInt ?? 0, 0);
      const limit = revisionsEntitlement.limitInt;

      if (reserved < 1) {
        throw new Error("INSUFFICIENT_REVISION_RESERVATION");
      }

      if (limit !== null && limit !== undefined && consumed + 1 > limit) {
        throw new Error("REVISION_LIMIT_EXCEEDED");
      }

      await tx.$executeRaw`
        UPDATE "ProjectEntitlement"
        SET "reservedInt" = GREATEST(COALESCE("reservedInt", 0) - 1, 0),
            "consumedInt" = COALESCE("consumedInt", 0) + 1,
            "updatedAt" = NOW()
        WHERE "projectId" = ${projectId}::uuid
          AND "key" = 'revisions'
      `;

      deliveredNow = true;
    }

    const updatedRevisionRequest = await tx.revisionRequest.update({
      where: { id: revisionRequest.id },
      data: { status: STATUS_DELIVERED },
      select: { id: true, status: true, updatedAt: true },
    });

    let project = null;

    await logAudit(tx, {
      projectId,
      actorId: user.id,
      type: "revision_delivered",
      payload: { revisionRequestId: updatedRevisionRequest.id, consumedEntitlement: deliveredNow },
    });

    await createProjectSystemMessage(tx, {
      projectId,
      fallbackUserId: user.id,
      body: `Revision update delivered (${updatedRevisionRequest.id.slice(0, 8)}).`,
    });

    if (setConceptsReady && previousStatus !== PROJECT_STATUS_CONCEPTS_READY) {
      project = await tx.project.update({
        where: { id: projectId },
        data: { status: PROJECT_STATUS_CONCEPTS_READY },
        select: { id: true, status: true },
      });

      await logAudit(tx, {
        projectId,
        actorId: user.id,
        type: "state_changed",
        payload: { previousStatus, nextStatus: PROJECT_STATUS_CONCEPTS_READY },
      });
    }

    return { updatedRevisionRequest, project };
  });

  await notifyClientRevisionReady(projectId, result.updatedRevisionRequest.id);

  return Response.json({ ok: true, revisionRequest: result.updatedRevisionRequest, project: result.project });
  } catch (error) {
    if (error instanceof Error && error.message === "REVISIONS_ENTITLEMENT_MISSING") {
      return jsonError("Revisions entitlement not configured", 400, { nextStep: "Set a revisions entitlement before marking delivered." }, "REVISIONS_ENTITLEMENT_MISSING");
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_REVISION_RESERVATION") {
      return jsonError("No reserved revision remaining for delivery", 400, { nextStep: "Ensure this revision was requested before delivery." }, "INSUFFICIENT_REVISION_RESERVATION");
    }
    if (error instanceof Error && error.message === "REVISION_LIMIT_EXCEEDED") {
      return jsonError("Delivering this revision exceeds entitlement", 400, { nextStep: "Increase revision entitlement before delivering." }, "REVISION_LIMIT_EXCEEDED");
    }
    return toRouteErrorResponse(error);
  }
}
