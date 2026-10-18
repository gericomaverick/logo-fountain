import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { normalizeBriefAnswers } from "@/lib/brief";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const PROJECT_STATUS_AWAITING_BRIEF = "AWAITING_BRIEF";

/**
 * A draft is the customer's own unfinished work, so this route is scoped to
 * project membership and deliberately does not widen to admins the way the
 * submitted-brief route does: nobody reads a brief before it is sent.
 */
async function authorizeDraftAccess(projectId: string) {
  const user = await requireUser();
  const project = await requireProjectMembership(user.id, projectId);
  return { user, projectId: project.id };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeDraftAccess(id);

    const draft = await prisma.projectBriefDraft.findUnique({
      where: { projectId: auth.projectId },
      select: { answers: true, updatedAt: true },
    });

    if (!draft) return Response.json({ draft: null });

    // A draft written against an older shape still opens: unknown keys are
    // dropped and missing ones come back empty.
    const answers = normalizeBriefAnswers(draft.answers);
    if (!answers) return Response.json({ draft: null });

    return Response.json({ draft: { answers, updatedAt: draft.updatedAt } });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;

  try {
    const { id } = await params;
    const auth = await authorizeDraftAccess(id);

    const body = await req.json().catch(() => null);
    const answers = normalizeBriefAnswers((body as { answers?: unknown } | null)?.answers);
    if (!answers) {
      return jsonError("Invalid draft payload", 400, { nextStep: "Send the brief answers object." }, "INVALID_BRIEF_DRAFT_PAYLOAD");
    }

    const project = await prisma.project.findUnique({ where: { id: auth.projectId }, select: { id: true, status: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    // Once the brief is in, there is nothing left to draft against.
    if (project.status !== PROJECT_STATUS_AWAITING_BRIEF) {
      return jsonError(
        `Brief has already been submitted for project ${project.id}`,
        400,
        { nextStep: "Brief can only be submitted once." },
        "BRIEF_LOCKED",
      );
    }

    const draft = await prisma.projectBriefDraft.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, answers, updatedBy: auth.user.id },
      update: { answers, updatedBy: auth.user.id },
      select: { updatedAt: true },
    });

    return Response.json({ ok: true, updatedAt: draft.updatedAt });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;

  try {
    const { id } = await params;
    const auth = await authorizeDraftAccess(id);

    // Discarding a draft that is already gone is the outcome the caller wanted.
    await prisma.projectBriefDraft.deleteMany({ where: { projectId: auth.projectId } });

    return Response.json({ ok: true });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
