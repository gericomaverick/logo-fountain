import { jsonError } from "@/lib/api-error";
import { getRequestOrigin } from "@/lib/request-origin";
import { requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { stripe, UPSELL_PRICE_TO_ACTION, type PackageCode } from "@/lib/stripe";

export const runtime = "nodejs";

type Body = {
  kind?: unknown;
  addonKey?: unknown;
  toPackage?: unknown;
};

const UPGRADE_PRICE_BY_PATH: Record<string, string> = Object.fromEntries(
  Object.entries(UPSELL_PRICE_TO_ACTION)
    .filter(([, action]) => action.kind === "upgrade")
    .map(([priceId, action]) => [`${action.fromPackage}->${action.toPackage}`, priceId]),
);

const EXTRA_REVISION_PRICE_ID = Object.entries(UPSELL_PRICE_TO_ACTION).find(
  ([, action]) => action.kind === "addon" && action.addonKey === "extra_revision",
)?.[0];

function parseKind(value: unknown): "addon" | "upgrade" | null {
  if (value === "addon" || value === "upgrade") return value;
  return null;
}

function parseAddonKey(value: unknown): "extra_revision" | null {
  if (value === "extra_revision") return value;
  return null;
}

function parsePackageCode(value: unknown): PackageCode | null {
  if (value === "essential" || value === "professional" || value === "complete") return value;
  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: projectId } = await params;
    const membershipProject = await requireProjectMembership(user.id, projectId);

    const project = await prisma.project.findUnique({
      where: { id: membershipProject.id },
      select: { id: true, packageCode: true },
    });

    if (!project) {
      return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");
    }

    let payload: Body;
    try {
      payload = (await req.json()) as Body;
    } catch {
      return jsonError("Invalid JSON body", 400, { nextStep: "Send a valid JSON payload." }, "INVALID_JSON");
    }

    const kind = parseKind(payload.kind);
    if (!kind) {
      return jsonError("Invalid kind. Expected 'addon' or 'upgrade'", 400, undefined, "INVALID_KIND");
    }

    const origin = getRequestOrigin(req);

    if (kind === "addon") {
      const addonKey = parseAddonKey(payload.addonKey);
      if (!addonKey) {
        return jsonError("Invalid addonKey. Expected 'extra_revision'", 400, undefined, "INVALID_ADDON_KEY");
      }

      if (!EXTRA_REVISION_PRICE_ID) {
        return jsonError("Stripe price not configured for extra revision", 500, undefined, "PRICE_NOT_CONFIGURED");
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_creation: "always",
        success_url: `${origin}/project/${project.id}?upsell=1&kind=addon&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/project/${project.id}`,
        line_items: [{ price: EXTRA_REVISION_PRICE_ID, quantity: 1 }],
        metadata: {
          kind,
          projectId: project.id,
          addonKey,
          fromPackage: project.packageCode,
        },
      });

      if (!session.url) return jsonError("Failed to create checkout session URL", 500, undefined, "CHECKOUT_URL_MISSING");
      return Response.json({ url: session.url });
    }

    const fromPackage = parsePackageCode(project.packageCode);
    const toPackage = parsePackageCode(payload.toPackage);
    if (!fromPackage || !toPackage) {
      return jsonError("Invalid package transition", 400, undefined, "INVALID_UPGRADE_PATH");
    }

    const upgradePriceId = UPGRADE_PRICE_BY_PATH[`${fromPackage}->${toPackage}`];
    if (!upgradePriceId) {
      return jsonError("Unsupported upgrade path", 400, undefined, "UNSUPPORTED_UPGRADE_PATH");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      success_url: `${origin}/project/${project.id}?upsell=1&kind=upgrade&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/project/${project.id}`,
      line_items: [{ price: upgradePriceId, quantity: 1 }],
      metadata: {
        kind,
        projectId: project.id,
        fromPackage,
        toPackage,
      },
    });

    if (!session.url) return jsonError("Failed to create checkout session URL", 500, undefined, "CHECKOUT_URL_MISSING");
    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof Error && error.name !== "RouteAuthError") {
      return jsonError(error.message || "Unable to create checkout session", 500, undefined, "CHECKOUT_SESSION_FAILED");
    }
    return toRouteErrorResponse(error);
  }
}
