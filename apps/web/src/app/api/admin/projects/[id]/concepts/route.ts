import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { isAdminUser } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadConceptAsset } from "@/lib/supabase/storage";

export const runtime = "nodejs";

const CONCEPT_STATUS_DRAFT = "draft";

function parseConceptNumber(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function parseNotes(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

async function authorizeAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: jsonError("Unauthorized", 401, undefined, "UNAUTHORIZED") };
  }

  if (!(await isAdminUser(user))) {
    return { error: jsonError("Forbidden", 403, undefined, "FORBIDDEN") };
  }

  return { user };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { id: projectId } = await params;

  const [project, concepts] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { status: true } }),
    prisma.concept.findMany({
      where: { projectId },
      orderBy: [{ number: "asc" }, { createdAt: "asc" }],
      select: { id: true, number: true, status: true, notes: true },
    }),
  ]);

  return Response.json({ concepts, projectStatus: project?.status ?? null });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });

  if (!project) {
    return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");
  }

  const formData = await req.formData();
  const fileEntry = formData.get("file");
  const conceptNumber = parseConceptNumber(formData.get("conceptNumber"));
  const notes = parseNotes(formData.get("notes"));

  if (!(fileEntry instanceof File) || fileEntry.size <= 0) {
    return Response.json({ error: "Image file is required" }, { status: 400 });
  }

  if (!fileEntry.type.startsWith("image/")) {
    return Response.json({ error: "Only image uploads are supported" }, { status: 400 });
  }

  if (!conceptNumber) {
    return Response.json({ error: "Valid conceptNumber is required" }, { status: 400 });
  }

  try {
    const concept = await prisma.concept.create({
      data: {
        projectId,
        number: conceptNumber,
        status: CONCEPT_STATUS_DRAFT,
        notes,
      },
      select: { id: true, number: true, status: true, notes: true },
    });

    const upload = await uploadConceptAsset({
      projectId,
      conceptId: concept.id,
      file: fileEntry,
    });

    await prisma.fileAsset.create({
      data: {
        projectId,
        kind: "concept",
        bucket: upload.bucket,
        path: upload.path,
        mime: upload.mime,
        size: upload.size,
        uploadedBy: user.id,
      },
    });

    return Response.json({ ok: true, concept });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload concept";
    return Response.json({ error: message }, { status: 400 });
  }
}
