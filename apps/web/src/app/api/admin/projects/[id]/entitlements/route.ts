import { jsonError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { computeEntitlementUsage } from "@/lib/entitlements";

export const runtime = "nodejs";

type Body = { concepts?: unknown; revisions?: unknown };

function parseLimit(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 0 || value > 1000) return undefined;
  return value;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const payload = (await req.json().catch(() => null)) as Body | null;
    if (!payload || typeof payload !== "object") {
      return jsonError("Invalid JSON body", 400, { nextStep: "Send concepts/revisions integer limits." }, "INVALID_JSON");
    }

    const concepts = parseLimit(payload.concepts);
    const revisions = parseLimit(payload.revisions);

    if (payload.concepts !== undefined && concepts === undefined) {
      return jsonError("Invalid concepts limit", 400, { nextStep: "Use an integer between 0 and 1000, or null." }, "INVALID_CONCEPTS_LIMIT");
    }
    if (payload.revisions !== undefined && revisions === undefined) {
      return jsonError("Invalid revisions limit", 400, { nextStep: "Use an integer between 0 and 1000, or null." }, "INVALID_REVISIONS_LIMIT");
    }

    if (payload.concepts === undefined && payload.revisions === undefined) {
      return jsonError("No entitlement updates provided", 400, { nextStep: "Provide concepts and/or revisions." }, "MISSING_LIMITS");
    }

    const { id } = await params;

    const updated = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id }, select: { id: true, packageCode: true } });
      if (!project) return null;

      const before = await tx.projectEntitlement.findMany({
        where: { projectId: id, key: { in: ["concepts", "revisions"] } },
        select: { key: true, limitInt: true, consumedInt: true, reservedInt: true },
      });

      const previousConceptLimit = before.find((entry) => entry.key === "concepts")?.limitInt ?? null;
      const previousRevisionLimit = before.find((entry) => entry.key === "revisions")?.limitInt ?? null;

      const hasConceptUpdate = payload.concepts !== undefined && previousConceptLimit !== concepts;
      const hasRevisionUpdate = payload.revisions !== undefined && previousRevisionLimit !== revisions;

      if (hasConceptUpdate) {
        await tx.projectEntitlement.upsert({
          where: { projectId_key: { projectId: id, key: "concepts" } },
          create: { projectId: id, key: "concepts", limitInt: concepts },
          update: { limitInt: concepts },
        });
      }

      if (hasRevisionUpdate) {
        await tx.projectEntitlement.upsert({
          where: { projectId_key: { projectId: id, key: "revisions" } },
          create: { projectId: id, key: "revisions", limitInt: revisions },
          update: { limitInt: revisions },
        });
      }

      const after = await tx.projectEntitlement.findMany({
        where: { projectId: id, key: { in: ["concepts", "revisions"] } },
        select: { key: true, limitInt: true, consumedInt: true, reservedInt: true },
      });

      if (hasConceptUpdate || hasRevisionUpdate) {
        await logAudit(tx, {
          projectId: id,
          actorId: user.id,
          type: "entitlement_limit_overridden",
          payload: {
            before,
            after,
            changed: {
              concepts: hasConceptUpdate,
              revisions: hasRevisionUpdate,
            },
          },
        });
      }

      const entitlementUsage = computeEntitlementUsage(after, project.packageCode);

      return {
        entitlements: after,
        entitlementUsage,
        changed: hasConceptUpdate || hasRevisionUpdate,
      };
    });

    if (!updated) {
      return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");
    }

    return Response.json({ ok: true, ...updated });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
