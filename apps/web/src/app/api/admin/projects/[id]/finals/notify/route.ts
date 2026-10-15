import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { notifyClientFinalDeliverablesReady } from "@/lib/project-lifecycle-email";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const NOTIFIABLE_STATUSES = ["FINAL_FILES_READY", "DELIVERED"];

class FinalNotificationConflictError extends Error {}

function isTransactionConflict(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return error instanceof FinalNotificationConflictError || code === "P2034" || code === "P2028";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  try {
    const user = await requireUser();
    await requireAdmin(user);
    const { id: projectId } = await params;
    const body = await req.json().catch(() => null) as { assetId?: unknown; projectUpdatedAt?: unknown } | null;
    const assetId = typeof body?.assetId === "string" ? body.assetId.trim() : "";
    const projectUpdatedAtValue = typeof body?.projectUpdatedAt === "string" ? body.projectUpdatedAt : "";
    const projectUpdatedAt = new Date(projectUpdatedAtValue);

    if (!assetId || !projectUpdatedAtValue || Number.isNaN(projectUpdatedAt.getTime())) {
      return jsonError(
        "Current final asset and project version are required",
        400,
        { nextStep: "Refresh the project before retrying the notification." },
        "FINAL_NOTIFICATION_VERSION_REQUIRED",
      );
    }

    let currentAsset: { id: string; path: string; createdAt: Date };
    try {
      currentAsset = await prisma.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: {
            id: projectId,
            status: { in: NOTIFIABLE_STATUSES },
            updatedAt: projectUpdatedAt,
            concepts: { some: { status: "approved" } },
            fileAssets: { some: { id: assetId, kind: "final_zip" } },
          },
          select: {
            id: true,
            status: true,
            updatedAt: true,
            fileAssets: {
              where: { kind: "final_zip" },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { id: true, path: true, createdAt: true },
            },
          },
        });

        const selectedAsset = project?.fileAssets[0];
        if (!project || !selectedAsset || selectedAsset.id !== assetId) {
          throw new FinalNotificationConflictError("Final publication changed before notification dispatch");
        }

        const guard = await tx.project.updateMany({
          where: {
            id: project.id,
            status: project.status,
            updatedAt: project.updatedAt,
            concepts: { some: { status: "approved" } },
            fileAssets: { some: { id: selectedAsset.id, kind: "final_zip", path: selectedAsset.path } },
          },
          // A same-version conditional write provides a late bounded DB guard.
          // The provider call remains outside the transaction.
          data: { updatedAt: project.updatedAt },
        });
        if (guard.count !== 1) {
          throw new FinalNotificationConflictError("Final publication changed before notification dispatch");
        }

        return selectedAsset;
      }, { isolationLevel: "Serializable", maxWait: 2_000, timeout: 5_000 });
    } catch (error) {
      if (isTransactionConflict(error)) {
        return jsonError(
          "Final publication changed before notification dispatch",
          409,
          { nextStep: "Refresh the project and retry against the current final." },
          "FINAL_NOTIFICATION_CONFLICT",
        );
      }
      throw error;
    }

    // This call follows the conditional current-asset/state guard immediately.
    // A state change after the DB transaction releases remains a narrow,
    // unavoidable race because the external provider call cannot be atomic with DB.
    try {
      const email = await notifyClientFinalDeliverablesReady(projectId, currentAsset.id);
      if (email.status === "skipped") {
        return Response.json({
          ok: false,
          committed: true,
          finalLive: true,
          code: "FINAL_NOTIFICATION_SKIPPED",
          message: "The guarded final remains live, but notification configuration or recipient data is missing.",
          email,
          fileAsset: currentAsset,
        }, { status: 503 });
      }

      return Response.json({
        ok: true,
        committed: true,
        finalLive: true,
        notification: email.status,
        fileAsset: currentAsset,
      });
    } catch {
      return Response.json({
        ok: false,
        committed: true,
        finalLive: true,
        code: "FINAL_NOTIFICATION_FAILED",
        message: "The guarded final remains live, but the client notification failed. Retry notification after email delivery is restored.",
        fileAsset: currentAsset,
      }, { status: 502 });
    }
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
