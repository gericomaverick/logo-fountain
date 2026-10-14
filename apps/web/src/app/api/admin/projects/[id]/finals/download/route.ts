import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { buildFinalDeliverableFilename } from "@/lib/final-deliverable-filename";
import { prisma } from "@/lib/prisma";
import { createSignedFinalDeliverableUrl } from "@/lib/supabase/storage";

export const runtime = "nodejs";

const DOWNLOADABLE_STATUSES = ["FINAL_FILES_READY", "DELIVERED"];

class AdminFinalDownloadConflict extends Error {}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
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
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { path: true, createdAt: true },
          },
        },
      });

      if (!project || !project.fileAssets[0]) return null;

      const guarded = await tx.project.updateMany({
        where: {
          id: project.id,
          status: project.status,
          concepts: { some: { status: "approved" } },
          fileAssets: { some: { kind: "final_zip" } },
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
      const url = await createSignedFinalDeliverableUrl(file.path, 60 * 60, fileName);
      return { url };
    }, { isolationLevel: "Serializable" });

    if (!result) {
      return jsonError("Final ZIP not available", 404, undefined, "FINAL_ZIP_NOT_AVAILABLE");
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof AdminFinalDownloadConflict) {
      return jsonError("Final download state changed", 409, undefined, "FINAL_DOWNLOAD_CONFLICT");
    }
    return toRouteErrorResponse(error);
  }
}
