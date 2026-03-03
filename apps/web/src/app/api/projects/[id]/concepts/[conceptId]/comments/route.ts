import { jsonError } from "@/lib/api-error";
import { RouteAuthError, requireAdmin, requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_COMMENT_LENGTH = 2000;

type RouteParams = { params: Promise<{ id: string; conceptId: string }> };

function parseCommentBody(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = typeof (raw as { body?: unknown }).body === "string" ? (raw as { body: string }).body.trim() : "";
  if (!body || body.length > MAX_COMMENT_LENGTH) return null;
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

async function assertConceptInProject(projectId: string, conceptId: string) {
  const concept = await prisma.concept.findFirst({ where: { id: conceptId, projectId }, select: { id: true } });
  if (!concept) throw new RouteAuthError("Concept not found", 404, "CONCEPT_NOT_FOUND", { nextStep: "Check the concept link." });
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { id, conceptId } = await params;
    const auth = await authorizeProjectAccess(id);
    await assertConceptInProject(auth.projectId, conceptId);

    const comments = await prisma.conceptComment.findMany({
      where: { projectId: auth.projectId, conceptId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, email: true, fullName: true, isAdmin: true } },
      },
    });

    return Response.json({ comments });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id, conceptId } = await params;
    const auth = await authorizeProjectAccess(id);
    await assertConceptInProject(auth.projectId, conceptId);

    const payload = await req.json().catch(() => null);
    const body = parseCommentBody(payload);
    if (!body) {
      return jsonError("Comment body is required (1-2000 chars)", 400, { nextStep: "Provide a non-empty comment." }, "INVALID_COMMENT_BODY");
    }

    await prisma.profile.upsert({
      where: { id: auth.user.id },
      create: {
        id: auth.user.id,
        email: auth.user.email ?? "",
        fullName: auth.user.user_metadata?.full_name ?? null,
        isAdmin: auth.admin,
      },
      update: {
        ...(auth.user.email ? { email: auth.user.email } : {}),
        isAdmin: auth.admin,
      },
    });

    const comment = await prisma.conceptComment.create({
      data: {
        projectId: auth.projectId,
        conceptId,
        authorId: auth.user.id,
        body,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, email: true, fullName: true, isAdmin: true } },
      },
    });

    return Response.json({ ok: true, comment }, { status: 201 });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
