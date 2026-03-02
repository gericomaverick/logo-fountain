import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSignedConceptAssetUrl } from "@/lib/supabase/storage";

export const runtime = "nodejs";

const CONCEPT_STATUS_PUBLISHED = "published";
const CONCEPT_STATUS_APPROVED = "approved";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      client: {
        memberships: {
          some: {
            userId: user.id,
          },
        },
      },
    },
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
        },
      },
    },
  });

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

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
      })
    : [];

  const fileByConceptId = new Map<string, { path: string }>();
  for (const file of files) {
    const fileName = file.path.split("/").pop() ?? "";
    const conceptId = fileName.split(".")[0];
    if (conceptId) {
      fileByConceptId.set(conceptId, { path: file.path });
    }
  }

  const concepts = await Promise.all(
    project.concepts.map(async (concept) => {
      const file = fileByConceptId.get(concept.id);
      const imageUrl = file ? await createSignedConceptAssetUrl(file.path) : null;

      return {
        ...concept,
        imageUrl,
      };
    }),
  );

  return Response.json({ concepts, projectStatus: project.status });
}
