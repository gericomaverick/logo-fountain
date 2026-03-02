import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PROJECT_STATUS_AWAITING_BRIEF = "AWAITING_BRIEF";
const PROJECT_STATUS_BRIEF_SUBMITTED = "BRIEF_SUBMITTED";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function parseAnswers(body: unknown) {
  if (typeof body !== "object" || body === null) return null;

  const raw = body as Record<string, unknown>;
  const brandName = typeof raw.brandName === "string" ? raw.brandName.trim() : "";
  const industry = typeof raw.industry === "string" ? raw.industry.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  const styleNotes = typeof raw.styleNotes === "string" ? raw.styleNotes.trim() : "";

  if (!brandName || !industry || !description || !styleNotes) return null;

  return {
    brandName,
    industry,
    description,
    styleNotes,
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401, undefined, "UNAUTHORIZED");
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const answers = parseAnswers(body);

  if (!answers) {
    return jsonError("Invalid brief payload", 400, undefined, "INVALID_BRIEF_PAYLOAD");
  }

  const project = await prisma.project.findFirst({
    where: {
      id,
      client: {
        memberships: {
          some: {
            userId: user.id,
          },
        },
      },
    },
    select: { id: true, status: true },
  });

  if (!project) {
    return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const latest = await tx.projectBrief.findFirst({
          where: { projectId: project.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });

        const version = (latest?.version ?? 0) + 1;

        const brief = await tx.projectBrief.create({
          data: {
            projectId: project.id,
            version,
            answers,
            createdBy: user.id,
          },
          select: { id: true, version: true },
        });

        if (project.status === PROJECT_STATUS_AWAITING_BRIEF) {
          await tx.project.update({
            where: { id: project.id },
            data: { status: PROJECT_STATUS_BRIEF_SUBMITTED },
          });
        }

        return brief;
      });

      return Response.json({ ok: true, briefId: result.id, version: result.version });
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) {
        continue;
      }

      throw error;
    }
  }

  return jsonError("Could not submit brief", 409, undefined, "BRIEF_CONFLICT");
}
