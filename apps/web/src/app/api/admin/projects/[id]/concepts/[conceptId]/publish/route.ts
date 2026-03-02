import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { isAdminUser } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PROJECT_STATUS_IN_DESIGN = "IN_DESIGN";
const PROJECT_STATUS_CONCEPTS_READY = "CONCEPTS_READY";
const CONCEPT_STATUS_PUBLISHED = "published";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; conceptId: string }> },
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

  const { id: projectId, conceptId } = await params;

  const concept = await prisma.concept.findFirst({
    where: { id: conceptId, projectId },
    select: { id: true },
  });

  if (!concept) {
    return jsonError("Concept not found", 404, undefined, "CONCEPT_NOT_FOUND");
  }

  const result = await prisma.$transaction(async (tx) => {
    const alreadyPublishedCount = await tx.concept.count({
      where: { projectId, status: CONCEPT_STATUS_PUBLISHED },
    });

    const updatedConcept = await tx.concept.update({
      where: { id: conceptId },
      data: { status: CONCEPT_STATUS_PUBLISHED },
      select: { id: true, status: true },
    });

    let updatedProjectStatus: string | null = null;

    if (alreadyPublishedCount === 0) {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { status: true },
      });

      if (project?.status === PROJECT_STATUS_IN_DESIGN) {
        const updatedProject = await tx.project.update({
          where: { id: projectId },
          data: { status: PROJECT_STATUS_CONCEPTS_READY },
          select: { status: true },
        });
        updatedProjectStatus = updatedProject.status;
      }
    }

    return { updatedConcept, updatedProjectStatus };
  });

  return Response.json({
    ok: true,
    concept: result.updatedConcept,
    projectStatus: result.updatedProjectStatus,
  });
}
