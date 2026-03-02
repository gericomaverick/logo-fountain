import { prisma } from "@/lib/prisma";
import { requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { jsonError } from "@/lib/api-error";

export const runtime = "nodejs";

type UpdateProfileBody = {
  firstName?: unknown;
  lastName?: unknown;
};

function parseOptionalName(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 80);
}

function toFullName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName.length > 0 ? fullName : null;
}

export async function GET() {
  try {
    const user = await requireUser();

    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, firstName: true, lastName: true, fullName: true },
    });

    return Response.json({
      profile: {
        id: user.id,
        email: profile?.email ?? user.email ?? null,
        firstName: profile?.firstName ?? null,
        lastName: profile?.lastName ?? null,
        fullName: profile?.fullName ?? null,
      },
    });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();

    let payload: UpdateProfileBody;
    try {
      payload = (await req.json()) as UpdateProfileBody;
    } catch {
      return jsonError("Invalid JSON body", 400, { nextStep: "Send a valid JSON payload." }, "INVALID_JSON");
    }

    const parsedFirstName = parseOptionalName(payload.firstName);
    const parsedLastName = parseOptionalName(payload.lastName);

    if (payload.firstName !== undefined && parsedFirstName === undefined) {
      return jsonError("Invalid firstName", 400, { nextStep: "firstName must be a string or null." }, "INVALID_FIRST_NAME");
    }

    if (payload.lastName !== undefined && parsedLastName === undefined) {
      return jsonError("Invalid lastName", 400, { nextStep: "lastName must be a string or null." }, "INVALID_LAST_NAME");
    }

    const existing = await prisma.profile.findUnique({ where: { id: user.id } });

    const firstName = payload.firstName !== undefined ? parsedFirstName ?? null : (existing?.firstName ?? null);
    const lastName = payload.lastName !== undefined ? parsedLastName ?? null : (existing?.lastName ?? null);

    const profile = await prisma.profile.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email ?? "",
        firstName,
        lastName,
        fullName: toFullName(firstName, lastName),
      },
      update: {
        ...(payload.firstName !== undefined ? { firstName } : {}),
        ...(payload.lastName !== undefined ? { lastName } : {}),
        fullName: toFullName(firstName, lastName),
      },
      select: { id: true, email: true, firstName: true, lastName: true, fullName: true },
    });

    return Response.json({ profile });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
