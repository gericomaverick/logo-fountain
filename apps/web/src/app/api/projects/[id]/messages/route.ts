import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;

type RouteParams = { params: Promise<{ id: string }> };

function parseMessageBody(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;

  const body = typeof (raw as { body?: unknown }).body === "string"
    ? (raw as { body: string }).body.trim()
    : "";

  if (!body) return null;
  if (body.length > MAX_MESSAGE_LENGTH) return null;

  return body;
}

async function authorizeProjectAccess(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const admin = await isAdminUser(user);

  const project = await prisma.project.findFirst({
    where: admin
      ? { id: projectId }
      : {
          id: projectId,
          client: {
            memberships: {
              some: {
                userId: user.id,
              },
            },
          },
        },
    select: { id: true },
  });

  if (!project) {
    return { error: Response.json({ error: "Project not found" }, { status: 404 }) };
  }

  return { user, admin, projectId: project.id };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const auth = await authorizeProjectAccess(id);
  if ("error" in auth) return auth.error;

  const messages = await prisma.message.findMany({
    where: { projectId: auth.projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      body: true,
      createdAt: true,
      sender: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
    },
  });

  return Response.json({ messages });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const auth = await authorizeProjectAccess(id);
  if ("error" in auth) return auth.error;

  const payload = await req.json().catch(() => null);
  const body = parseMessageBody(payload);

  if (!body) {
    return Response.json({ error: "Message body is required (1-2000 chars)" }, { status: 400 });
  }

  const message = await prisma.$transaction(async (tx) => {
    const thread = await tx.messageThread.upsert({
      where: { projectId: auth.projectId },
      update: {},
      create: { projectId: auth.projectId },
      select: { id: true },
    });

    return tx.message.create({
      data: {
        threadId: thread.id,
        projectId: auth.projectId,
        senderId: auth.user.id,
        body,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        sender: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });
  });

  return Response.json({ ok: true, message }, { status: 201 });
}
