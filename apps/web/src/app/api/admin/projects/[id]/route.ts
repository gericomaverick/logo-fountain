import { jsonError } from "@/lib/api-error";
import { getProjectSnapshot } from "@/lib/project-snapshot";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id } = await params;
    const snapshot = await getProjectSnapshot({ projectId: id });
    if (!snapshot) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    return Response.json({ snapshot });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
