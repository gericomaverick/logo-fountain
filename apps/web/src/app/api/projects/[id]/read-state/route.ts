import { jsonError } from "@/lib/api-error";
import { RouteAuthError, requireAdmin, requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };
type SeenArea = "messages" | "concepts";

function parseArea(payload: unknown): SeenArea | null {
  if (!payload || typeof payload !== "object") return null;
  const area = (payload as { area?: unknown }).area;
  return area === "messages" || area === "concepts" ? area : null;
}

async function authorizeProjectAccess(projectId: string) {
  const user = await requireUser();

  try {
    await requireAdmin(user);
    return { user, projectId };
  } catch (error) {
    if (!(error instanceof RouteAuthError) || error.status !== 403) throw error;
    const project = await requireProjectMembership(user.id, projectId);
    return { user, projectId: project.id };
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await authorizeProjectAccess(id);
    const payload = await req.json().catch(() => null);
    const area = parseArea(payload);

    if (!area) {
      return jsonError("area is required ('messages' | 'concepts')", 400, { nextStep: "Send area=messages or area=concepts." }, "INVALID_AREA");
    }

    const now = new Date();

    await prisma.projectReadState.upsert({
      where: { userId_projectId: { userId: auth.user.id, projectId: auth.projectId } },
      create: {
        userId: auth.user.id,
        projectId: auth.projectId,
        ...(area === "messages" ? { lastSeenMessagesAt: now } : { lastSeenConceptsAt: now }),
      },
      update: area === "messages" ? { lastSeenMessagesAt: now } : { lastSeenConceptsAt: now },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
