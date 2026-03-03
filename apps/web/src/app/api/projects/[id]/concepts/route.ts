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


    const conceptIds = project.concepts.map((concept) => concept.id);
    const files = conceptIds.length
      ? await prisma.fileAsset.findMany({
          where: {
            projectId: project.id,
            kind: "concept",
            OR: conceptIds.flatMap((conceptId) => ([
              { path: { startsWith: `${project.id}/${conceptId}.` } },
              { path: { startsWith: `${project.id}/${conceptId}/v` } },
            ])),
          },
          orderBy: [{ createdAt: "desc" }],
        })
      : [];

    const fileByConceptId = new Map<string, { path: string }>();
    const versionByConceptId = new Map<string, number>();

    for (const file of files) {
      const parts = file.path.split("/");
      const fileName = parts.at(-1) ?? "";
      const conceptId = parts.length >= 3 ? (parts[1] ?? "") : fileName.split(".")[0];
      if (!conceptId) continue;

      const versionMatch = fileName.match(/^v(\d+)\./);
      const parsedVersion = versionMatch?.[1] ? Number.parseInt(versionMatch[1], 10) : 1;
      const safeVersion = Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
      versionByConceptId.set(conceptId, Math.max(versionByConceptId.get(conceptId) ?? 0, safeVersion));

      if (!fileByConceptId.has(conceptId)) fileByConceptId.set(conceptId, { path: file.path });
    }

    const concepts = await Promise.all(
      project.concepts.map(async (concept) => {
        const file = fileByConceptId.get(concept.id);
        const imageUrl = file ? await createSignedConceptAssetUrl(file.path) : null;

        const version = versionByConceptId.get(concept.id) ?? 0;

        return {
          ...concept,
          revisionVersion: Math.max(version, 1),
          imageUrl,
        };
      }),
    );

    return Response.json({ concepts, projectStatus: project.status });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
