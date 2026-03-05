import { RouteAuthError, requireAdmin, toRouteErrorResponse, requireProjectMembership, requireUser } from "@/lib/auth/require";
import { jsonError } from "@/lib/api-error";
import { getProjectSnapshot } from "@/lib/project-snapshot";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    let projectId = id;

    try {
      await requireAdmin(user);
    } catch (error) {
      if (!(error instanceof RouteAuthError) || error.status !== 403) throw error;
      const project = await requireProjectMembership(user.id, id);
      projectId = project.id;
    }

    const snapshot = await getProjectSnapshot({ projectId, userId: user.id, standardizeClientDownloadName: true });
    if (!snapshot) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    return Response.json({ snapshot });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
