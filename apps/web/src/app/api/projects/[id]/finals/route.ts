import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { createSignedFinalDeliverableUrl } from "@/lib/storage/r2";
import { requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { buildFinalDeliverableFilename } from "@/lib/final-deliverable-filename";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const PROJECT_STATUS_FINAL_FILES_READY = "FINAL_FILES_READY";
const PROJECT_STATUS_DELIVERED = "DELIVERED";
const DOWNLOADABLE_STATUSES = [PROJECT_STATUS_FINAL_FILES_READY, PROJECT_STATUS_DELIVERED];

class FinalDownloadConflict extends Error {}

function isRetryableTransactionConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && ((error as { code?: string }).code === "P2034" || (error as { code?: string }).code === "P2028");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  try {
    const user = await requireUser();
    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id,
          status: { in: DOWNLOADABLE_STATUSES },
          client: { memberships: { some: { userId: user.id } } },
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
                    select: {
                      firstName: true,
                      lastName: true,
                      fullName: true,
                      email: true,
                    },
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
          client: { memberships: { some: { userId: user.id } } },
          concepts: { some: { status: "approved" } },
          fileAssets: { some: { id: project.fileAssets[0].id, kind: "final_zip", path: project.fileAssets[0].path } },
        },
        // A same-value DELIVERED write is intentional: it takes a row lock and
        // makes this authorization/readiness check participate in serialization.
        data: {
          status: PROJECT_STATUS_DELIVERED,
          ...(project.status === PROJECT_STATUS_DELIVERED ? { updatedAt: project.updatedAt } : {}),
        },
      });

      if (guarded.count !== 1) throw new FinalDownloadConflict("Final download state changed");

      if (project.status === PROJECT_STATUS_FINAL_FILES_READY) {
        const transition = applyTransition(project.status, PROJECT_STATUS_DELIVERED);
        if (!transition.ok) throw new FinalDownloadConflict("Final download transition is no longer valid");

        await logAudit(tx, {
          projectId: project.id,
          actorId: user.id,
          type: "state_changed",
          payload: {
            previousStatus: project.status,
            nextStatus: PROJECT_STATUS_DELIVERED,
            reason: "client_final_zip_download",
          },
        });
      }

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

      // Signing stays inside the bounded serializable operation, after the exact
      // asset id/path guard. A URL is never returned if authorization rolls back.
      // Once returned, the one-hour storage URL cannot be transactionally revoked.
      const url = await createSignedFinalDeliverableUrl(file.path, 60 * 60, fileName);
      return { url };
    }, { isolationLevel: "Serializable", maxWait: 2_000, timeout: 5_000 });

    if (!result) {
      return jsonError(
        "Final ZIP not available",
        404,
        { nextStep: "Final files require approval and a completed delivery state." },
        "FINAL_ZIP_NOT_AVAILABLE",
      );
    }

    return Response.json(result);
  } catch (error) {
    if (error instanceof FinalDownloadConflict || isRetryableTransactionConflict(error)) {
      return jsonError(
        "Final download state changed; retry from the refreshed project",
        409,
        { nextStep: "Refresh the project before retrying." },
        "FINAL_DOWNLOAD_CONFLICT",
      );
    }
    return toRouteErrorResponse(error);
  }
}
