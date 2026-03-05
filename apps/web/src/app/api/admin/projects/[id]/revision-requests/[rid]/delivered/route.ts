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
      payload: { revisionRequestId: updatedRevisionRequest.id },
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
    return toRouteErrorResponse(error);
  }
}
