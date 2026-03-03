import { prisma } from "@/lib/prisma";
import { createSignedConceptAssetUrl } from "@/lib/supabase/storage";
import { RouteAuthError, requireAdmin, requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

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

type ConceptAssetItem = {
  path: string;
  version: number;
  createdAt: string;
  url: string;
  notes: string | null;
};

function parseAssetVersion(path: string): number {
  const parts = path.split("/");
  const fileName = parts.at(-1) ?? "";

  // Legacy: <projectId>/<conceptId>.<ext> => v1
  if (parts.length === 2) return 1;

  const match = fileName.match(/^v(\d+)\./);
  if (!match?.[1]) return 1;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; conceptId: string }> },
) {
  try {
    const { id, conceptId } = await params;
    const auth = await authorizeProjectAccess(id);

    const files = await prisma.fileAsset.findMany({
      where: {
        projectId: auth.projectId,
        kind: "concept",
        OR: [
          { path: { startsWith: `${auth.projectId}/${conceptId}.` } },
          { path: { startsWith: `${auth.projectId}/${conceptId}/v` } },
        ],
      },
      orderBy: [{ createdAt: "desc" }],
      select: { path: true, createdAt: true, notes: true },
    });

    const assets: ConceptAssetItem[] = [];
    for (const file of files) {
      assets.push({
        path: file.path,
        version: parseAssetVersion(file.path),
        createdAt: file.createdAt.toISOString(),
        url: await createSignedConceptAssetUrl(file.path),
        notes: file.notes ?? null,
      });
    }

    assets.sort((a, b) => {
      if (b.version !== a.version) return b.version - a.version;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return Response.json({ assets });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
