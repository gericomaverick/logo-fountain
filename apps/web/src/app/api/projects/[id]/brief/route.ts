import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { RouteAuthError, requireAdmin, requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";
const PROJECT_STATUS_BRIEF_SUBMITTED = "BRIEF_SUBMITTED";
const BRIEF_RECEIVED_SYSTEM_MESSAGE = "Brief received. Your designer will review and reply soon.";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

function parseAnswers(body: unknown) {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  const brandName = typeof raw.brandName === "string" ? raw.brandName.trim() : "";
  const industry = typeof raw.industry === "string" ? raw.industry.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  const styleNotes = typeof raw.styleNotes === "string" ? raw.styleNotes.trim() : "";
  return brandName && industry && description && styleNotes ? { brandName, industry, description, styleNotes } : null;
}

function getAdminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function getSystemSenderId(fallbackUserId: string): Promise<string> {
  const adminByFlag = await prisma.profile.findFirst({ where: { isAdmin: true }, select: { id: true } });
  if (adminByFlag?.id) return adminByFlag.id;

  const adminEmails = getAdminEmailAllowlist();
  if (adminEmails.length > 0) {
    const adminByEmail = await prisma.profile.findFirst({
      where: { email: { in: adminEmails } },
      select: { id: true },
    });
    if (adminByEmail?.id) return adminByEmail.id;
  }

  return fallbackUserId;
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
    const answers = parseAnswers(body);
    if (!answers) return jsonError("Invalid brief payload", 400, { nextStep: "Fill all required brief fields." }, "INVALID_BRIEF_PAYLOAD");

    const projectRef = await requireProjectMembership(user.id, id);
    const project = await prisma.project.findUnique({ where: { id: projectRef.id }, select: { id: true, status: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    const transition = applyTransition(project.status, PROJECT_STATUS_BRIEF_SUBMITTED);
    if (!transition.ok) return jsonError(`Invalid transition from ${project.status} to ${PROJECT_STATUS_BRIEF_SUBMITTED}`, 400, { allowed: transition.allowed, nextStep: "Submit brief only when project is ready." }, "INVALID_PROJECT_STATUS_TRANSITION");

    const systemSenderId = await getSystemSenderId(user.id);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const latest = await tx.projectBrief.findFirst({ where: { projectId: project.id }, orderBy: { version: "desc" }, select: { version: true } });
          const version = (latest?.version ?? 0) + 1;
          const brief = await tx.projectBrief.create({ data: { projectId: project.id, version, answers, createdBy: user.id }, select: { id: true, version: true } });
          await tx.project.update({ where: { id: project.id }, data: { status: PROJECT_STATUS_BRIEF_SUBMITTED } });

          const thread = await tx.messageThread.upsert({
            where: { projectId: project.id },
            update: {},
            create: { projectId: project.id },
            select: { id: true },
          });

          const existingSystemMessage = await tx.message.findFirst({
            where: { threadId: thread.id, body: BRIEF_RECEIVED_SYSTEM_MESSAGE },
            select: { id: true },
          });

          if (!existingSystemMessage) {
            await tx.message.create({
              data: {
                threadId: thread.id,
                projectId: project.id,
                senderId: systemSenderId,
                body: BRIEF_RECEIVED_SYSTEM_MESSAGE,
              },
            });
          }

          await logAudit(tx, { projectId: project.id, actorId: user.id, type: "brief_submitted", payload: { briefId: brief.id, version } });
          await logAudit(tx, { projectId: project.id, actorId: user.id, type: "state_changed", payload: { previousStatus: project.status, nextStatus: PROJECT_STATUS_BRIEF_SUBMITTED } });
          return brief;
        });

        return Response.json({ ok: true, briefId: result.id, version: result.version });
      } catch (error) {
        if (attempt === 0 && isUniqueViolation(error)) continue;
        throw error;
      }
    }

    return jsonError("Could not submit brief", 409, { nextStep: "Retry submitting the brief." }, "BRIEF_CONFLICT");
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
