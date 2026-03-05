import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { RouteAuthError, requireAdmin, requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { createProjectSystemMessage } from "@/lib/system-messages";
import { validateBriefSubmission } from "@/lib/brief";

export const runtime = "nodejs";
const PROJECT_STATUS_BRIEF_SUBMITTED = "BRIEF_SUBMITTED";
const BRIEF_RECEIVED_SYSTEM_MESSAGE = "Brief received. Your designer will review and reply soon.";


function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

async function authorizeProjectAccess(projectId: string) {
  const user = await requireUser();

  try {
    await requireAdmin(user);
    return { user, projectId };
  } catch (error) {
    if (!(error instanceof RouteAuthError) || error.status !== 403) throw error;
    const project = await requireProjectMembership(user.id, projectId);
    return { user, projectId: project.id };
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeProjectAccess(id);

    const brief = await prisma.projectBrief.findFirst({
      where: { projectId: auth.projectId },
      orderBy: { version: "desc" },
      select: { id: true, version: true, answers: true, createdAt: true, createdBy: true },
    });

    if (!brief) {
      return Response.json({ brief: null });
    }

    return Response.json({ brief });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = validateBriefSubmission(body);
    if (!parsed.ok) {
      return jsonError(
        "Invalid brief payload",
        400,
        { nextStep: `Fill all required brief fields (${parsed.missing.join(", ")}).` },
        "INVALID_BRIEF_PAYLOAD",
      );
    }
    const answers = parsed.answers;

    const projectRef = await requireProjectMembership(user.id, id);
    const project = await prisma.project.findUnique({ where: { id: projectRef.id }, select: { id: true, status: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    if (project.status !== "AWAITING_BRIEF") {
      return jsonError(
        `Brief has already been submitted for project ${project.id}`,
        400,
        { nextStep: "Brief can only be submitted once." },
        "BRIEF_LOCKED",
      );
    }

    const transition = applyTransition(project.status, PROJECT_STATUS_BRIEF_SUBMITTED);

    if (!transition.ok) {
      return jsonError(
        `Invalid transition from ${project.status} to ${PROJECT_STATUS_BRIEF_SUBMITTED}`,
        400,
        { allowed: transition.allowed, nextStep: "Submit brief only when project is ready." },
        "INVALID_PROJECT_STATUS_TRANSITION",
      );
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const latest = await tx.projectBrief.findFirst({ where: { projectId: project.id }, orderBy: { version: "desc" }, select: { id: true, version: true } });
          if (latest) {
            throw new Error("BRIEF_ALREADY_SUBMITTED");
          }

          const version = 1;
          const brief = await tx.projectBrief.create({ data: { projectId: project.id, version, answers, createdBy: user.id }, select: { id: true, version: true } });

          await tx.project.update({ where: { id: project.id }, data: { status: PROJECT_STATUS_BRIEF_SUBMITTED } });

          await createProjectSystemMessage(tx, {
            projectId: project.id,
            fallbackUserId: user.id,
            body: BRIEF_RECEIVED_SYSTEM_MESSAGE,
          });

          await logAudit(tx, { projectId: project.id, actorId: user.id, type: "brief_submitted", payload: { briefId: brief.id, version, isResubmission: false } });
          await logAudit(tx, { projectId: project.id, actorId: user.id, type: "state_changed", payload: { previousStatus: project.status, nextStatus: PROJECT_STATUS_BRIEF_SUBMITTED } });
          return brief;
        });

        return Response.json({ ok: true, briefId: result.id, version: result.version });
      } catch (error) {
        if (attempt === 0 && isUniqueViolation(error)) continue;
        if (error instanceof Error && error.message === "BRIEF_ALREADY_SUBMITTED") {
          return jsonError(
            `Brief has already been submitted for project ${project.id}`,
            400,
            { nextStep: "Brief can only be submitted once." },
            "BRIEF_LOCKED",
          );
        }
        throw error;
      }
    }

    return jsonError("Could not submit brief", 409, { nextStep: "Retry submitting the brief." }, "BRIEF_CONFLICT");
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
