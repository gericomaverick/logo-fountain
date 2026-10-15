import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { createProjectSystemMessage } from "@/lib/system-messages";
import { notifyClientRevisionReady } from "@/lib/project-lifecycle-email";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const STATUS_DELIVERED = "delivered";
const PROJECT_STATUS_CONCEPTS_READY = "CONCEPTS_READY";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; rid: string }> },
) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  try {
  const user = await requireUser();
  await requireAdmin(user);

  const { id: projectId, rid } = await params;
  const payload = (await req.json().catch(() => null)) as { setConceptsReady?: boolean } | null;
  const setConceptsReady = payload?.setConceptsReady !== false;

  const result = await prisma.$transaction(async (tx) => {
    const revisionRequest = await tx.revisionRequest.findFirst({ where: { id: rid, projectId }, select: { id: true, status: true, updatedAt: true } });
    if (!revisionRequest) throw new Error("REVISION_REQUEST_NOT_FOUND");
    const currentProject = await tx.project.findUnique({ where: { id: projectId }, select: { status: true, updatedAt: true } });
    if (!currentProject) throw new Error("PROJECT_NOT_FOUND");
    if (revisionRequest.status === STATUS_DELIVERED) return { updatedRevisionRequest: revisionRequest, project: null, deliveredNow: false };
    if (!["REVISIONS_IN_PROGRESS", "CONCEPTS_READY"].includes(currentProject.status)) throw new Error("INVALID_PROJECT_STATUS_TRANSITION");
    if (setConceptsReady && !applyTransition(currentProject.status, PROJECT_STATUS_CONCEPTS_READY).ok && currentProject.status !== PROJECT_STATUS_CONCEPTS_READY) throw new Error("INVALID_PROJECT_STATUS_TRANSITION");
    const previousStatus = currentProject.status;
    const guard = await tx.project.updateMany({ where: { id: projectId, status: currentProject.status, updatedAt: currentProject.updatedAt }, data: { updatedAt: new Date() } });
    if (guard.count !== 1) throw new Error("REVISION_DELIVERY_CONFLICT");
    const claimed = await tx.revisionRequest.updateMany({ where: { id: rid, projectId, status: revisionRequest.status }, data: { status: STATUS_DELIVERED } });
    if (claimed.count !== 1) throw new Error("REVISION_DELIVERY_CONFLICT");
    {
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

      const changed = await tx.$executeRaw`
        UPDATE "ProjectEntitlement"
        SET "reservedInt" = GREATEST(COALESCE("reservedInt", 0) - 1, 0),
            "consumedInt" = COALESCE("consumedInt", 0) + 1,
            "updatedAt" = NOW()
        WHERE "projectId" = ${projectId}::uuid
          AND "key" = 'revisions'
          AND COALESCE("reservedInt", 0) >= 1
          AND ("limitInt" IS NULL OR COALESCE("consumedInt", 0) + 1 <= "limitInt")
      `;

      if (changed !== 1) throw new Error("REVISION_DELIVERY_CONFLICT");
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
      payload: { revisionRequestId: updatedRevisionRequest.id, consumedEntitlement: true },
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

    return { updatedRevisionRequest, project, deliveredNow: true };
  }, { isolationLevel: "Serializable" });

  if (result.deliveredNow) await notifyClientRevisionReady(projectId, result.updatedRevisionRequest.id).catch(() => undefined);

  return Response.json({ ok: true, revisionRequest: result.updatedRevisionRequest, project: result.project });
  } catch (error) {
    if (error instanceof Error && ["REVISION_DELIVERY_CONFLICT", "INVALID_PROJECT_STATUS_TRANSITION"].includes(error.message)) return jsonError("Revision or project state changed; refresh before retrying", 409, undefined, error.message);
    if (error instanceof Error && ["PROJECT_NOT_FOUND", "REVISION_REQUEST_NOT_FOUND"].includes(error.message)) return jsonError("Project or request not found", 404, undefined, error.message);
    if (error instanceof Error && error.message === "REVISIONS_ENTITLEMENT_MISSING") {
      return jsonError("Revisions entitlement not configured", 400, { nextStep: "Set a revisions entitlement before marking delivered." }, "REVISIONS_ENTITLEMENT_MISSING");
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_REVISION_RESERVATION") {
      return jsonError("No reserved revision remaining for delivery", 400, { nextStep: "Ensure this revision was requested before delivery." }, "INSUFFICIENT_REVISION_RESERVATION");
    }
    if (error instanceof Error && error.message === "REVISION_LIMIT_EXCEEDED") {
      return jsonError("Delivering this revision exceeds entitlement", 400, { nextStep: "Increase revision entitlement before delivering." }, "REVISION_LIMIT_EXCEEDED");
    }
    if (typeof error === "object" && error !== null && "code" in error && ["P2034", "P2028"].includes(String(error.code))) return jsonError("Concurrent lifecycle change; refresh before retrying", 409, undefined, "LIFECYCLE_CONFLICT");
    return toRouteErrorResponse(error);
  }
}
