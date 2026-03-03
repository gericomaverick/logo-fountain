import { jsonError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Body = { key?: unknown; confirm?: unknown };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId } = await params;

    const payload = (await req.json().catch(() => null)) as Body | null;
    const key = typeof payload?.key === "string" ? payload.key : null;
    const confirm = payload?.confirm === true;

    if (key !== "concepts" && key !== "revisions") {
      return jsonError("Only key=concepts or key=revisions is supported", 400, { nextStep: "Send { key: 'concepts' } or { key: 'revisions', confirm: true }." }, "INVALID_KEY");
    }

    if (key === "revisions" && !confirm) {
      return jsonError("Resetting revisions requires confirm=true", 400, { nextStep: "Send { key: 'revisions', confirm: true }." }, "CONFIRM_REQUIRED");
    }

    const before = await prisma.projectEntitlement.findFirst({
      where: { projectId, key },
      select: { id: true, limitInt: true, consumedInt: true },
    });

    await prisma.projectEntitlement.updateMany({
      where: { projectId, key },
      data: { consumedInt: 0 },
    });

    const after = await prisma.projectEntitlement.findFirst({
      where: { projectId, key },
      select: { id: true, limitInt: true, consumedInt: true },
    });

    await logAudit(prisma, {
      projectId,
      actorId: user.id,
      type: "entitlement_usage_reset",
      payload: { key, before, after },
    });

    return Response.json({ ok: true, key, before, after });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
