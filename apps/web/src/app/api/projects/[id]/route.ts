import { toRouteErrorResponse, requireProjectMembership, requireUser } from "@/lib/auth/require";
import { jsonError } from "@/lib/api-error";
import { getProjectSnapshot } from "@/lib/project-snapshot";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const project = await requireProjectMembership(user.id, id);

    const snapshot = await getProjectSnapshot({ projectId: project.id });
    if (!snapshot) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    return Response.json({ snapshot });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
