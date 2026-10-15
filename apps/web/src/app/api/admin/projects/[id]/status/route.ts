import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const GENERIC_ADMIN_TARGETS = new Set(["ON_HOLD", "CANCELLED"]);

function parseBody(body: unknown): { status: string | null; reason: string | null } {
  if (typeof body !== "object" || body === null) return { status: null, reason: null };
  const raw = body as Record<string, unknown>;
  const status = typeof raw.status === "string" ? raw.status.trim() : "";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  return { status: status || null, reason: reason || null };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);
    const { id } = await params;
    const { status: nextStatus, reason } = parseBody(await req.json().catch(() => null));
    if (!nextStatus) return jsonError("Missing status", 400, { nextStep: "Provide status in request body." }, "MISSING_STATUS");
    if (!GENERIC_ADMIN_TARGETS.has(nextStatus)) {
      return jsonError(
        "Lifecycle status must be changed by its domain action",
        400,
        { nextStep: "Use concept publication, revision delivery, approval, final publication, or final download." },
        "DOMAIN_ACTION_REQUIRED",
      );
    }
    if (!reason) return jsonError("A reason is required", 400, { nextStep: "Provide a specific operational reason." }, "REASON_REQUIRED");

    const project = await prisma.project.findUnique({ where: { id }, select: { id: true, status: true, updatedAt: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");
    const transition = applyTransition(project.status, nextStatus, { reason });
    if (!transition.ok) return jsonError(`Invalid transition from ${project.status} to ${nextStatus}`, 400, { allowed: transition.allowed }, "INVALID_PROJECT_STATUS_TRANSITION");

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.project.updateMany({
        where: { id: project.id, status: project.status, updatedAt: project.updatedAt },
        data: { status: nextStatus },
      });
      if (changed.count !== 1) throw new Error("STATUS_CHANGE_CONFLICT");
      await logAudit(tx, {
        projectId: project.id,
        actorId: user.id,
        type: "state_changed",
        payload: { previousStatus: project.status, nextStatus, reason, source: "constrained_admin_exception" },
      });
      return { id: project.id, status: nextStatus };
    });
    return Response.json({ ok: true, project: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "STATUS_CHANGE_CONFLICT") return jsonError("Project status changed; refresh before retrying", 409, undefined, "STATUS_CHANGE_CONFLICT");
    return toRouteErrorResponse(error);
  }
}
