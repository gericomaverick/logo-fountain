import { prisma } from "@/lib/prisma";
import { createSignedConceptAssetUrl } from "@/lib/supabase/storage";
import { RouteAuthError, requireAdmin, requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const CONCEPT_STATUS_PUBLISHED = "published";
const CONCEPT_STATUS_APPROVED = "approved";

async function authorizeProjectAccess(projectId: string) {
  const user = await requireUser();

  try {
    await requireAdmin(user);
    return { projectId };
  } catch (error) {
    if (!(error instanceof RouteAuthError) || error.status !== 403) throw error;
    const membershipProject = await requireProjectMembership(user.id, projectId);
    return { projectId: membershipProject.id };
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeProjectAccess(id);

    const project = await prisma.project.findUnique({
      where: { id: auth.projectId },
      select: {
        id: true,
        status: true,
        concepts: {
          where: { status: { in: [CONCEPT_STATUS_PUBLISHED, CONCEPT_STATUS_APPROVED] } },
          orderBy: { number: "asc" },
          select: {
            id: true,
            number: true,
            status: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!project) {
      return Response.json({ concepts: [], projectStatus: null });
    }

    const deliveredRevisionCounts = await prisma.revisionRequest.groupBy({
      by: ["conceptId"],
      where: { projectId: project.id, status: "delivered", conceptId: { not: null } },
      _count: { _all: true },
    });

    const deliveredByConceptId = new Map(
      deliveredRevisionCounts
        .filter((entry) => Boolean(entry.conceptId))
        .map((entry) => [entry.conceptId as string, entry._count._all]),
    );

    const conceptIds = project.concepts.map((concept) => concept.id);
    const files = conceptIds.length
      ? await prisma.fileAsset.findMany({
          where: {
            projectId: project.id,
            kind: "concept",
            OR: conceptIds.map((conceptId) => ({
              path: { startsWith: `${project.id}/${conceptId}.` },
            })),
          },
          orderBy: [{ createdAt: "desc" }],
        })
      : [];

    const fileByConceptId = new Map<string, { path: string }>();
    for (const file of files) {
      const fileName = file.path.split("/").pop() ?? "";
      const conceptId = fileName.split(".")[0];
      if (conceptId && !fileByConceptId.has(conceptId)) {
        fileByConceptId.set(conceptId, { path: file.path });
      }
    }

    const concepts = await Promise.all(
      project.concepts.map(async (concept) => {
        const file = fileByConceptId.get(concept.id);
        const imageUrl = file ? await createSignedConceptAssetUrl(file.path) : null;

        return {
          ...concept,
          revisionVersion: (deliveredByConceptId.get(concept.id) ?? 0) + 1,
          imageUrl,
        };
      }),
    );

    return Response.json({ concepts, projectStatus: project.status });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
