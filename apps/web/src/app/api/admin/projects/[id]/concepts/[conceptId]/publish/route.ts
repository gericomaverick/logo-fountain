import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { createProjectSystemMessage } from "@/lib/system-messages";
import { notifyClientConceptReady } from "@/lib/project-lifecycle-email";

export const runtime = "nodejs";

const PROJECT_STATUS_CONCEPTS_READY = "CONCEPTS_READY";
const CONCEPT_STATUS_PUBLISHED = "published";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; conceptId: string }> },
) {
  try {
  const user = await requireUser();
  await requireAdmin(user);

  const { id: projectId, conceptId } = await params;

  const concept = await prisma.concept.findFirst({
    where: { id: conceptId, projectId },
    select: { id: true, number: true },
  });

  if (!concept) {
    return jsonError("Concept not found", 404, undefined, "CONCEPT_NOT_FOUND");
  }

  const [alreadyPublishedCount, project] = await Promise.all([
    prisma.concept.count({ where: { projectId, status: CONCEPT_STATUS_PUBLISHED } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { status: true } }),
  ]);

  if (!project) {
    return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");
  }

  if (alreadyPublishedCount === 0) {
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

  const result = await prisma.$transaction(async (tx) => {
    const updatedConcept = await tx.concept.update({
      where: { id: conceptId },
      data: { status: CONCEPT_STATUS_PUBLISHED },
      select: { id: true, number: true, status: true },
    });

    let updatedProjectStatus: string | null = null;

    await logAudit(tx, {
      projectId,
      actorId: user.id,
      type: "concept_published",
      payload: { conceptId: updatedConcept.id },
    });

    await createProjectSystemMessage(tx, {
      projectId,
      fallbackUserId: user.id,
      body: `Concept ${updatedConcept.number} is ready for review.`,
    });

    if (alreadyPublishedCount === 0) {
      const updatedProject = await tx.project.update({
        where: { id: projectId },
        data: { status: PROJECT_STATUS_CONCEPTS_READY },
        select: { status: true },
      });
      updatedProjectStatus = updatedProject.status;

      await logAudit(tx, {
        projectId,
        actorId: user.id,
        type: "state_changed",
        payload: { previousStatus: project.status, nextStatus: PROJECT_STATUS_CONCEPTS_READY },
      });
    }

    return { updatedConcept, updatedProjectStatus };
  });

  await notifyClientConceptReady(projectId, result.updatedConcept.id);

  return Response.json({
    ok: true,
    concept: result.updatedConcept,
    projectStatus: result.updatedProjectStatus,
  });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
