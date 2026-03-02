import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

function parseNextStatus(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  const nextStatus = typeof raw.status === "string" ? raw.status.trim() : "";
  return nextStatus || null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const nextStatus = parseNextStatus(body);
    if (!nextStatus) return jsonError("Missing status", 400, { nextStep: "Provide status in request body." }, "MISSING_STATUS");

    const project = await prisma.project.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    const transition = applyTransition(project.status, nextStatus);
    if (!transition.ok) {
      return jsonError(`Invalid transition from ${project.status} to ${nextStatus}`, 400, { allowed: transition.allowed, nextStep: "Use one of the allowed statuses." }, "INVALID_PROJECT_STATUS_TRANSITION");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({ where: { id: project.id }, data: { status: nextStatus }, select: { id: true, status: true } });
      await logAudit(tx, { projectId: project.id, actorId: user.id, type: "state_changed", payload: { previousStatus: project.status, nextStatus } });
      return updatedProject;
    });

    return Response.json({ ok: true, project: updated });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
