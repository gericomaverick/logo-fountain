import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 5000;
const REVISION_STATUS_REQUESTED = "requested";
const CONCEPT_STATUS_PUBLISHED = "published";
const PROJECT_STATUS_REVISIONS_IN_PROGRESS = "REVISIONS_IN_PROGRESS";

type RevisionBody = { body: string; conceptId?: string | null };
function parseBody(raw: unknown): RevisionBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = typeof (raw as { body?: unknown }).body === "string" ? (raw as { body: string }).body.trim() : "";
  const conceptId = typeof (raw as { conceptId?: unknown }).conceptId === "string" ? (raw as { conceptId: string }).conceptId : null;
  return body && body.length <= MAX_BODY_LENGTH ? { body, conceptId } : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const payload = await req.json().catch(() => null);
    const parsed = parseBody(payload);
    if (!parsed) return jsonError("Body is required (1-5000 chars)", 400, { nextStep: "Provide a revision body up to 5000 chars." }, "INVALID_BODY");

    const { id: projectId } = await params;
    const projectRef = await requireProjectMembership(user.id, projectId);
    const project = await prisma.project.findUnique({ where: { id: projectRef.id }, select: { id: true, status: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    const transition = applyTransition(project.status, PROJECT_STATUS_REVISIONS_IN_PROGRESS);
    if (!transition.ok) return jsonError(`Invalid transition from ${project.status} to ${PROJECT_STATUS_REVISIONS_IN_PROGRESS}`, 400, { allowed: transition.allowed, nextStep: "Request revision when project is eligible." }, "INVALID_PROJECT_STATUS_TRANSITION");

    const latestPublishedConcept = await prisma.concept.findFirst({ where: { projectId: project.id, status: CONCEPT_STATUS_PUBLISHED }, orderBy: [{ number: "desc" }, { createdAt: "desc" }], select: { id: true } });
    const conceptId = parsed.conceptId ?? latestPublishedConcept?.id ?? null;
    if (conceptId) {
      const concept = await prisma.concept.findFirst({ where: { id: conceptId, projectId: project.id }, select: { id: true } });
      if (!concept) return jsonError("Concept not found for project", 400, { nextStep: "Choose a concept from this project." }, "CONCEPT_NOT_FOUND");
    }

    const revisionRequest = await prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "ProjectEntitlement"
        SET "consumedInt" = "consumedInt" + 1,
            "updatedAt" = NOW()
        WHERE "projectId" = ${project.id}::uuid
          AND "key" = 'revisions'
          AND "limitInt" IS NOT NULL
          AND "consumedInt" < "limitInt"
        RETURNING "id"
      `;
      if (updated.length === 0) throw new Error("NO_REVISIONS_REMAINING");

      const created = await tx.revisionRequest.create({ data: { projectId: project.id, conceptId, status: REVISION_STATUS_REQUESTED, requestedBy: user.id, body: parsed.body }, select: { id: true, projectId: true, conceptId: true, status: true, body: true, createdAt: true } });
      const updatedProject = await tx.project.update({ where: { id: project.id }, data: { status: PROJECT_STATUS_REVISIONS_IN_PROGRESS }, select: { id: true, status: true } });
      await logAudit(tx, { projectId: project.id, actorId: user.id, type: "revision_requested", payload: { revisionRequestId: created.id, conceptId } });
      await logAudit(tx, { projectId: project.id, actorId: user.id, type: "state_changed", payload: { previousStatus: project.status, nextStatus: PROJECT_STATUS_REVISIONS_IN_PROGRESS } });
      return { revisionRequest: created, project: updatedProject };
    });

    return Response.json({ ok: true, revisionRequest: revisionRequest.revisionRequest, project: revisionRequest.project }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_REVISIONS_REMAINING") {
      return jsonError("No revisions remaining", 400, { nextStep: "Buy a revision add-on to continue." }, "NO_REVISIONS_REMAINING");
    }
    return toRouteErrorResponse(error);
  }
}
