import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { isAdminUser } from "@/lib/auth/admin";
import { applyTransition } from "@/lib/project-state-machine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

function parseNextStatus(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;

  const raw = body as Record<string, unknown>;
  const nextStatus = typeof raw.status === "string" ? raw.status.trim() : "";

  return nextStatus || null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401, undefined, "UNAUTHORIZED");
  }

  if (!(await isAdminUser(user))) {
    return jsonError("Forbidden", 403, undefined, "FORBIDDEN");
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const nextStatus = parseNextStatus(body);

  if (!nextStatus) {
    return Response.json({ error: "Missing status" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!project) {
    return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");
  }

  const transition = applyTransition(project.status, nextStatus);
  if (!transition.ok) {
    return jsonError(
      `Invalid transition from ${project.status} to ${nextStatus}`,
      400,
      { allowed: transition.allowed },
      "INVALID_PROJECT_STATUS_TRANSITION",
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedProject = await tx.project.update({
      where: { id: project.id },
      data: { status: nextStatus },
      select: { id: true, status: true },
    });

    await logAudit(tx, {
      projectId: project.id,
      actorId: user.id,
      type: "state_changed",
      payload: { previousStatus: project.status, nextStatus },
    });

    return updatedProject;
  });

  return Response.json({ ok: true, project: updated });
}
