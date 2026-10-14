import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { notifyClientFinalDeliverablesReady } from "@/lib/project-lifecycle-email";

export const runtime = "nodejs";

const NOTIFIABLE_STATUSES = ["FINAL_FILES_READY", "DELIVERED"];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireAdmin(user);
    const { id: projectId } = await params;

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        status: { in: NOTIFIABLE_STATUSES },
        concepts: { some: { status: "approved" } },
        fileAssets: { some: { kind: "final_zip" } },
      },
      select: {
        id: true,
        status: true,
        fileAssets: {
          where: { kind: "final_zip" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { id: true, path: true, createdAt: true },
        },
      },
    });

    const currentAsset = project?.fileAssets[0];
    if (!project || !currentAsset) {
      return jsonError(
        "Current final publication is not ready for notification",
        409,
        { nextStep: "Confirm an approved concept and a published final ZIP, then refresh." },
        "FINAL_NOTIFICATION_NOT_READY",
      );
    }

    try {
      const email = await notifyClientFinalDeliverablesReady(project.id, currentAsset.id);
      if (email.status === "skipped") {
        return Response.json({
          ok: false,
          committed: true,
          finalLive: true,
          code: "FINAL_NOTIFICATION_SKIPPED",
          message: "The current final remains live, but notification configuration or recipient data is missing.",
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
        message: "The current final remains live, but the client notification failed. Retry notification after email delivery is restored.",
        fileAsset: currentAsset,
      }, { status: 502 });
    }
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
