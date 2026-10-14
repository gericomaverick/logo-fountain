import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { buildFinalDeliverableFilename } from "@/lib/final-deliverable-filename";
import { prisma } from "@/lib/prisma";
import { createSignedFinalDeliverableUrl } from "@/lib/supabase/storage";
import { hasCanonicalSameOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const DOWNLOADABLE_STATUSES = ["FINAL_FILES_READY", "DELIVERED"];

class AdminFinalDownloadConflict extends Error {}

function isRetryableTransactionConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && ((error as { code?: string }).code === "P2034" || (error as { code?: string }).code === "P2028");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!hasCanonicalSameOrigin(req)) {
      return jsonError("Cross-origin final download request rejected", 403, undefined, "INVALID_REQUEST_ORIGIN");
    }
    const user = await requireUser();
    await requireAdmin(user);
    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id,
          status: { in: DOWNLOADABLE_STATUSES },
          concepts: { some: { status: "approved" } },
          fileAssets: { some: { kind: "final_zip" } },
        },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          client: {
            select: {
              name: true,
              memberships: {
                select: {
                  role: true,
                  user: {
                    select: { firstName: true, lastName: true, fullName: true, email: true },
                  },
                },
              },
            },
          },
          fileAssets: {
            where: { kind: "final_zip" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { id: true, path: true, createdAt: true },
          },
        },
      });

      if (!project || !project.fileAssets[0]) return null;

      const guarded = await tx.project.updateMany({
        where: {
          id: project.id,
          status: project.status,
          concepts: { some: { status: "approved" } },
          fileAssets: { some: { id: project.fileAssets[0].id, kind: "final_zip", path: project.fileAssets[0].path } },
        },
        data: { status: project.status, updatedAt: project.updatedAt },
      });
      if (guarded.count !== 1) throw new AdminFinalDownloadConflict("Final download state changed");

      const owner = project.client.memberships.find((membership) => membership.role.toLowerCase() === "owner")
        ?? project.client.memberships[0];
      const fullName = owner
        ? [owner.user.firstName, owner.user.lastName].filter(Boolean).join(" ").trim()
          || owner.user.fullName?.trim()
          || null
        : null;
      const file = project.fileAssets[0];
      const fileName = buildFinalDeliverableFilename({
        clientName: fullName,
        clientEmail: owner?.user.email ?? null,
        companyName: project.client.name,
        createdAt: file.createdAt,
      });
      // The exact selected asset is authorized before signing. A returned one-hour
      // storage URL cannot be transactionally revoked after this authorization point.
      const url = await createSignedFinalDeliverableUrl(file.path, 60 * 60, fileName);
      return { url };
    }, { isolationLevel: "Serializable", maxWait: 2_000, timeout: 5_000 });

    if (!result) {
      return jsonError("Final ZIP not available", 404, undefined, "FINAL_ZIP_NOT_AVAILABLE");
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof AdminFinalDownloadConflict || isRetryableTransactionConflict(error)) {
      return jsonError("Final download state changed", 409, undefined, "FINAL_DOWNLOAD_CONFLICT");
    }
    return toRouteErrorResponse(error);
  }
}
