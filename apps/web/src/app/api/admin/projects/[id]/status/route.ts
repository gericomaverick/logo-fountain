import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyTransition, canTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const GENERIC_ADMIN_TARGETS = new Set(["ON_HOLD", "CANCELLED", "RESUME"]);

function parseBody(body: unknown): { status: string | null; reason: string | null } {
  if (typeof body !== "object" || body === null) return { status: null, reason: null };
  const raw = body as Record<string, unknown>;
  const status = typeof raw.status === "string" ? raw.status.trim() : "";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  return { status: status || null, reason: reason || null };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  try {
    const user = await requireUser();
    await requireAdmin(user);
    const { id } = await params;
    const { status: requestedStatus, reason } = parseBody(await req.json().catch(() => null));
    if (!requestedStatus) return jsonError("Missing status", 400, { nextStep: "Provide status in request body." }, "MISSING_STATUS");
    if (!GENERIC_ADMIN_TARGETS.has(requestedStatus)) {
      return jsonError(
        "Lifecycle status must be changed by its domain action",
        400,
        { nextStep: "Use concept publication, revision delivery, approval, final publication, or final download." },
        "DOMAIN_ACTION_REQUIRED",
      );
    }
    if (!reason || reason.length > 500) return jsonError("A reason is required", 400, { nextStep: "Provide a specific operational reason." }, "REASON_REQUIRED");

    const project = await prisma.project.findUnique({ where: { id }, select: { id: true, status: true, updatedAt: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");
    const updated = await prisma.$transaction(async (tx) => {
      let nextStatus = requestedStatus;
      if (requestedStatus === "RESUME") {
        if (project.status !== "ON_HOLD") throw new Error("INVALID_HOLD_RESUME");
        const event = await tx.auditEvent.findFirst({ where: { projectId: id, type: "state_changed" }, orderBy: { createdAt: "desc" } });
        const hold = event?.payload as { previousStatus?: string; nextStatus?: string; heldVersion?: string } | undefined;
        if (hold?.nextStatus !== "ON_HOLD" || (hold.heldVersion !== undefined && hold.heldVersion !== project.updatedAt.toISOString()) || !hold.previousStatus || !canTransition(hold.previousStatus, "ON_HOLD")) throw new Error("INVALID_HOLD_RESUME");
        nextStatus = hold.previousStatus;
        // Restore only the exact recorded phase, and revalidate domain evidence.
        if (["BRIEF_SUBMITTED", "IN_DESIGN", "CONCEPTS_READY", "REVISIONS_IN_PROGRESS", "AWAITING_APPROVAL", "FINAL_FILES_READY", "DELIVERED"].includes(nextStatus)) {
          if (!await tx.projectBrief.count({ where: { projectId: id } })) throw new Error("INVALID_HOLD_RESUME");
        }
        if (nextStatus === "CONCEPTS_READY" && !await tx.concept.count({ where: { projectId: id, status: { in: ["published", "approved"] } } })) throw new Error("INVALID_HOLD_RESUME");
        if (nextStatus === "REVISIONS_IN_PROGRESS" && !await tx.revisionRequest.count({ where: { projectId: id, status: { not: "delivered" } } })) throw new Error("INVALID_HOLD_RESUME");
        if (["AWAITING_APPROVAL", "FINAL_FILES_READY", "DELIVERED"].includes(nextStatus) && !await tx.concept.count({ where: { projectId: id, status: "approved" } })) throw new Error("INVALID_HOLD_RESUME");
        if (["FINAL_FILES_READY", "DELIVERED"].includes(nextStatus) && !await tx.fileAsset.count({ where: { projectId: id, kind: "final_zip" } })) throw new Error("INVALID_HOLD_RESUME");
      }
      const transition = applyTransition(project.status, nextStatus, { reason });
      if (!transition.ok) throw new Error("INVALID_HOLD_RESUME");
      const version = new Date();
      const changed = await tx.project.updateMany({
        where: { id: project.id, status: project.status, updatedAt: project.updatedAt },
        data: { status: nextStatus, updatedAt: version },
      });
      if (changed.count !== 1) throw new Error("STATUS_CHANGE_CONFLICT");
      await logAudit(tx, {
        projectId: project.id,
        actorId: user.id,
        type: "state_changed",
        payload: { previousStatus: project.status, nextStatus, reason, source: requestedStatus === "RESUME" ? "hold_resume" : "constrained_admin_exception", ...(nextStatus === "ON_HOLD" ? { heldVersion: version.toISOString() } : {}) },
      });
      return { id: project.id, status: nextStatus };
    }, { isolationLevel: "Serializable" });
    return Response.json({ ok: true, project: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_HOLD_RESUME") return jsonError("Recorded phase cannot safely be restored; refresh and review domain evidence", 409, undefined, "INVALID_HOLD_RESUME");
    if (error instanceof Error && error.message === "STATUS_CHANGE_CONFLICT") return jsonError("Project status changed; refresh before retrying", 409, undefined, "STATUS_CHANGE_CONFLICT");
    if (typeof error === "object" && error !== null && "code" in error && ["P2034", "P2028"].includes(String(error.code))) return jsonError("Concurrent lifecycle change; refresh before retrying", 409, undefined, "LIFECYCLE_CONFLICT");
    return toRouteErrorResponse(error);
  }
}
