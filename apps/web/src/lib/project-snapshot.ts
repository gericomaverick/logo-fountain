import { prisma } from "@/lib/prisma";
import { createSignedConceptAssetUrl, createSignedFinalDeliverableUrl } from "@/lib/supabase/storage";

const PUBLISHED_OR_APPROVED = ["published", "approved"];

type SnapshotArgs = {
  projectId: string;
};

export async function getProjectSnapshot({ projectId }: SnapshotArgs) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      packageCode: true,
      entitlements: {
        where: { key: { in: ["concepts", "revisions"] } },
        select: { key: true, limitInt: true, consumedInt: true },
      },
      concepts: {
        where: { status: { in: PUBLISHED_OR_APPROVED } },
        orderBy: [{ number: "desc" }, { createdAt: "desc" }],
        select: { id: true, number: true, status: true, notes: true, createdAt: true },
      },
      revisionRequests: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          status: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          concept: { select: { id: true, number: true } },
          user: { select: { id: true, email: true, fullName: true } },
        },
      },
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          body: true,
          createdAt: true,
          sender: { select: { id: true, email: true, fullName: true } },
        },
      },
      fileAssets: {
        where: { kind: { in: ["concept", "final_zip"] } },
        orderBy: [{ createdAt: "desc" }],
        select: { kind: true, path: true },
      },
    },
  });

  if (!project) return null;

  const entitlements = { concepts: 0, revisions: 0 };
  for (const entitlement of project.entitlements) {
    const remaining = Math.max((entitlement.limitInt ?? 0) - entitlement.consumedInt, 0);
    if (entitlement.key === "concepts") entitlements.concepts = remaining;
    if (entitlement.key === "revisions") entitlements.revisions = remaining;
  }

  const conceptFiles = new Map<string, string>();
  for (const file of project.fileAssets) {
    if (file.kind !== "concept") continue;
    const fileName = file.path.split("/").pop() ?? "";
    const conceptId = fileName.split(".")[0];
    if (conceptId && !conceptFiles.has(conceptId)) conceptFiles.set(conceptId, file.path);
  }

  const concepts = await Promise.all(project.concepts.map(async (concept) => ({
    id: concept.id,
    number: concept.number,
    status: concept.status,
    notes: concept.notes,
    createdAt: concept.createdAt,
    imageUrl: conceptFiles.get(concept.id)
      ? await createSignedConceptAssetUrl(conceptFiles.get(concept.id) as string)
      : null,
  })));

  const finalAsset = project.fileAssets.find((f) => f.kind === "final_zip");
  const finalZip = finalAsset
    ? {
        available: true,
        url: await createSignedFinalDeliverableUrl(finalAsset.path),
      }
    : { available: false, url: null };

  return {
    projectId: project.id,
    status: project.status,
    packageCode: project.packageCode,
    entitlements,
    concepts,
    latestConcepts: concepts.slice(0, 5),
    revisionRequests: project.revisionRequests,
    latestRevisionRequests: project.revisionRequests.slice(0, 5),
    messages: project.messages,
    finalZip,
  };
}
