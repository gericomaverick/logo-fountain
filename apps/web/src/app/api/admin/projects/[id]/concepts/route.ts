import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { uploadConceptAsset } from "@/lib/supabase/storage";
import { logAudit } from "@/lib/audit";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";
const CONCEPT_STATUS_DRAFT = "draft";

function parseConceptNumber(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function parseNotes(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

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
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    const formData = await req.formData();
    const fileEntry = formData.get("file");
    const conceptNumber = parseConceptNumber(formData.get("conceptNumber"));
    const notes = parseNotes(formData.get("notes"));

    if (!(fileEntry instanceof File) || fileEntry.size <= 0) return jsonError("Image file is required", 400, { nextStep: "Upload an image file." }, "FILE_REQUIRED");
    if (!fileEntry.type.startsWith("image/")) return jsonError("Only image uploads are supported", 400, { nextStep: "Upload a PNG/JPEG/WebP image." }, "INVALID_FILE_TYPE");
    if (!conceptNumber) return jsonError("Valid conceptNumber is required", 400, { nextStep: "Set conceptNumber to a positive integer." }, "INVALID_CONCEPT_NUMBER");

    const concept = await prisma.concept.create({ data: { projectId, number: conceptNumber, status: CONCEPT_STATUS_DRAFT, notes }, select: { id: true, number: true, status: true, notes: true } });
    const upload = await uploadConceptAsset({ projectId, conceptId: concept.id, file: fileEntry });

    await prisma.fileAsset.create({
      data: { projectId, kind: "concept", bucket: upload.bucket, path: upload.path, mime: upload.mime, size: upload.size, uploadedBy: user.id },
    });

    await logAudit(prisma, { projectId, actorId: user.id, type: "concept_uploaded", payload: { conceptId: concept.id, conceptNumber: concept.number, filePath: upload.path } });
    return Response.json({ ok: true, concept });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
