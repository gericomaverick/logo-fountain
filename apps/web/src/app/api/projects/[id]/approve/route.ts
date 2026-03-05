import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { notifyClientConceptApproved } from "@/lib/project-lifecycle-email";

export const runtime = "nodejs";

const CONCEPT_STATUS_PUBLISHED = "published";
const CONCEPT_STATUS_APPROVED = "approved";
const CONCEPT_STATUS_ARCHIVED = "archived";
const PROJECT_STATUS_AWAITING_APPROVAL = "AWAITING_APPROVAL";

type ApproveBody = {
  conceptId: string;
};

function parseBody(raw: unknown): ApproveBody | null {
  if (typeof raw !== "object" || raw === null) return null;

  const conceptId = typeof (raw as { conceptId?: unknown }).conceptId === "string"
    ? (raw as { conceptId: string }).conceptId.trim()
    : "";

  if (!conceptId) return null;
  return { conceptId };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();

    const payload = await req.json().catch(() => null);
    const parsed = parseBody(payload);

    if (!parsed) {
      return jsonError("conceptId is required", 400, { nextStep: "Provide a valid conceptId in the request body." }, "INVALID_CONCEPT_ID");
    }

    const { id: projectId } = await params;
    const projectMembership = await requireProjectMembership(user.id, projectId);

    const project = await prisma.project.findUnique({ where: { id: projectMembership.id }, select: { id: true, status: true } });

    if (!project) {
      return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");
    }

    const concept = await prisma.concept.findFirst({
      where: {
        id: parsed.conceptId,
        projectId: project.id,
        status: CONCEPT_STATUS_PUBLISHED,
      },
      select: { id: true, number: true },
    });

    if (!concept) {
      return jsonError("Published concept not found", 404, { nextStep: "Pick a published concept from this project." }, "CONCEPT_NOT_FOUND");
    }

    const transition = applyTransition(project.status, PROJECT_STATUS_AWAITING_APPROVAL);
    if (!transition.ok) {
      return jsonError(
        `Invalid transition from ${project.status} to ${PROJECT_STATUS_AWAITING_APPROVAL}`,
        400,
        { allowed: transition.allowed, nextStep: "Use an allowed project status transition." },
        "INVALID_PROJECT_STATUS_TRANSITION",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.concept.updateMany({
        where: {
          projectId: project.id,
          id: { not: concept.id },
          status: { in: [CONCEPT_STATUS_PUBLISHED, CONCEPT_STATUS_APPROVED] },
        },
        data: { status: CONCEPT_STATUS_ARCHIVED },
      });

      const approved = await tx.concept.update({
        where: { id: concept.id },
        data: { status: CONCEPT_STATUS_APPROVED },
        select: { id: true, number: true, status: true },
      });

      const updatedProject = await tx.project.update({
        where: { id: project.id },
        data: { status: PROJECT_STATUS_AWAITING_APPROVAL },
        select: { id: true, status: true },
      });

      await logAudit(tx, {
        projectId: project.id,
        actorId: user.id,
        type: "concept_approved",
        payload: { conceptId: approved.id, conceptNumber: approved.number },
      });

      await logAudit(tx, {
        projectId: project.id,
        actorId: user.id,
        type: "state_changed",
        payload: { previousStatus: project.status, nextStatus: PROJECT_STATUS_AWAITING_APPROVAL },
      });

      return { approved, project: updatedProject };
    });

    await notifyClientConceptApproved(project.id, result.approved.id);

    return Response.json({ ok: true, concept: result.approved, project: result.project });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
