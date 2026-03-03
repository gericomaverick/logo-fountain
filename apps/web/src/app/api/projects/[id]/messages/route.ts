import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { jsonError } from "@/lib/api-error";
import { RouteAuthError, requireAdmin, requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;

type RouteParams = { params: Promise<{ id: string }> };

function parseMessageBody(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = typeof (raw as { body?: unknown }).body === "string" ? (raw as { body: string }).body.trim() : "";
  if (!body || body.length > MAX_MESSAGE_LENGTH) return null;
  return body;
}

async function authorizeProjectAccess(projectId: string) {
  const user = await requireUser();
  let admin = false;

  try {
    await requireAdmin(user);
    admin = true;
  } catch (error) {
    if (!(error instanceof RouteAuthError) || error.status !== 403) throw error;
    await requireProjectMembership(user.id, projectId);
  }

  return { user, admin, projectId };
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await authorizeProjectAccess(id);

    const messages = await prisma.message.findMany({
      where: { projectId: auth.projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, body: true, createdAt: true, sender: { select: { id: true, email: true, fullName: true } } },
    });

    return Response.json({ messages });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await authorizeProjectAccess(id);

    const payload = await req.json().catch(() => null);
    const body = parseMessageBody(payload);
    if (!body) return jsonError("Message body is required (1-2000 chars)", 400, { nextStep: "Provide a non-empty message." }, "INVALID_MESSAGE_BODY");

    await prisma.profile.upsert({
      where: { id: auth.user.id },
      create: {
        id: auth.user.id,
        email: auth.user.email ?? "",
        fullName: auth.user.user_metadata?.full_name ?? null,
      },
      update: {
        ...(auth.user.email ? { email: auth.user.email } : {}),
      },
    });

    const message = await prisma.$transaction(async (tx) => {
      const thread = await tx.messageThread.upsert({ where: { projectId: auth.projectId }, update: {}, create: { projectId: auth.projectId }, select: { id: true } });
      const created = await tx.message.create({
        data: { threadId: thread.id, projectId: auth.projectId, senderId: auth.user.id, body },
        select: { id: true, body: true, createdAt: true, sender: { select: { id: true, email: true, fullName: true } } },
      });

      await logAudit(tx, {
        projectId: auth.projectId,
        actorId: auth.user.id,
        type: "message_sent",
        payload: { messageId: created.id, isAdmin: auth.admin },
      });

      return created;
    });

    return Response.json({ ok: true, message }, { status: 201 });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
