import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 5000;
const REVISION_STATUS_REQUESTED = "requested";
const CONCEPT_STATUS_PUBLISHED = "published";

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

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = parseBody(payload);
  if (!parsed) {
    return Response.json({ error: "Body is required (1-5000 chars)" }, { status: 400 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      client: {
        memberships: {
          some: {
            userId: user.id,
          },
        },
      },
    },
    select: { id: true },
  });

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const latestPublishedConcept = await prisma.concept.findFirst({
    where: { projectId: project.id, status: CONCEPT_STATUS_PUBLISHED },
    orderBy: [{ number: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  const conceptId = parsed.conceptId ?? latestPublishedConcept?.id ?? null;

  if (conceptId) {
    const concept = await prisma.concept.findFirst({
      where: { id: conceptId, projectId: project.id },
      select: { id: true },
    });

    if (!concept) {
      return Response.json({ error: "Concept not found for project" }, { status: 400 });
    }
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

      if (updated.length === 0) {
        throw new Error("NO_REVISIONS_REMAINING");
      }

      return tx.revisionRequest.create({
        data: {
          projectId: project.id,
          conceptId,
          status: REVISION_STATUS_REQUESTED,
          requestedBy: user.id,
          body: parsed.body,
        },
        select: {
          id: true,
          projectId: true,
          conceptId: true,
          status: true,
          body: true,
          createdAt: true,
        },
      });
    });

    return Response.json({ ok: true, revisionRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_REVISIONS_REMAINING") {
      return Response.json({ error: "No revisions remaining" }, { status: 400 });
    }

    return Response.json({ error: "Failed to submit revision request" }, { status: 500 });
  }
}
