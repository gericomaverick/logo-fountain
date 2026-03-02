import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 5000;
const REVISION_STATUS_REQUESTED = "requested";
const CONCEPT_STATUS_PUBLISHED = "published";
const PROJECT_STATUS_REVISIONS_IN_PROGRESS = "REVISIONS_IN_PROGRESS";

type RevisionBody = {
  body: string;
  conceptId?: string | null;
};

function parseBody(raw: unknown): RevisionBody | null {
  if (typeof raw !== "object" || raw === null) return null;

  const body = typeof (raw as { body?: unknown }).body === "string"
    ? (raw as { body: string }).body.trim()
    : "";

  const conceptId = typeof (raw as { conceptId?: unknown }).conceptId === "string"
    ? (raw as { conceptId: string }).conceptId
    : null;

  if (!body || body.length > MAX_BODY_LENGTH) return null;

  return { body, conceptId };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401, { nextStep: "Sign in and retry." }, "UNAUTHORIZED");

  const payload = await req.json().catch(() => null);
  const parsed = parseBody(payload);
  if (!parsed) return jsonError("Body is required (1-5000 chars)", 400, undefined, "INVALID_BODY");

  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      client: { memberships: { some: { userId: user.id } } },
    },
    select: { id: true, status: true },
  });

  if (!project) return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");

  const transition = applyTransition(project.status, PROJECT_STATUS_REVISIONS_IN_PROGRESS);
  if (!transition.ok) {
    return jsonError(
      `Invalid transition from ${project.status} to ${PROJECT_STATUS_REVISIONS_IN_PROGRESS}`,
      400,
      { allowed: transition.allowed },
      "INVALID_PROJECT_STATUS_TRANSITION",
    );
  }

  const latestPublishedConcept = await prisma.concept.findFirst({
    where: { projectId: project.id, status: CONCEPT_STATUS_PUBLISHED },
    orderBy: [{ number: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  const conceptId = parsed.conceptId ?? latestPublishedConcept?.id ?? null;

  if (conceptId) {
    const concept = await prisma.concept.findFirst({ where: { id: conceptId, projectId: project.id }, select: { id: true } });
    if (!concept) return jsonError("Concept not found for project", 400, undefined, "CONCEPT_NOT_FOUND");
  }

  try {
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

      const revisionRequest = await tx.revisionRequest.create({
        data: { projectId: project.id, conceptId, status: REVISION_STATUS_REQUESTED, requestedBy: user.id, body: parsed.body },
        select: { id: true, projectId: true, conceptId: true, status: true, body: true, createdAt: true },
      });

      const updatedProject = await tx.project.update({
        where: { id: project.id },
        data: { status: PROJECT_STATUS_REVISIONS_IN_PROGRESS },
        select: { id: true, status: true },
      });

      await logAudit(tx, {
        projectId: project.id,
        actorId: user.id,
        type: "revision_requested",
        payload: { revisionRequestId: revisionRequest.id, conceptId },
      });

      await logAudit(tx, {
        projectId: project.id,
        actorId: user.id,
        type: "state_changed",
        payload: { previousStatus: project.status, nextStatus: PROJECT_STATUS_REVISIONS_IN_PROGRESS },
      });

      return { revisionRequest, project: updatedProject };
    });

    return Response.json({ ok: true, revisionRequest: revisionRequest.revisionRequest, project: revisionRequest.project }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_REVISIONS_REMAINING") {
      return jsonError("No revisions remaining", 400, { nextStep: "No revisions remaining—buy add-on." }, "NO_REVISIONS_REMAINING");
    }
    return jsonError("Failed to submit revision request", 500, undefined, "REVISION_REQUEST_FAILED");
  }
}
