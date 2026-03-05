import { jsonError } from "@/lib/api-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { getRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

type Body = { session_id?: unknown };

function parseSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildSetPasswordRedirect(baseUrl: string, projectId?: string | null): string {
  const redirect = new URL("/set-password", baseUrl);
  const nextPath = projectId ? `/project/${projectId}` : "/dashboard";
  redirect.searchParams.set("next", nextPath);
  if (projectId) redirect.searchParams.set("projectId", projectId);
  return redirect.toString();
}

function buildSigninRedirect(baseUrl: string, projectId?: string | null): string {
  const redirect = new URL(projectId ? `/project/${projectId}` : "/dashboard", baseUrl);
  return redirect.toString();
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body", 400, undefined, "INVALID_JSON");
  }

  const sessionId = parseSessionId(body.session_id);
  if (!sessionId) return jsonError("Missing session_id", 400, undefined, "MISSING_SESSION_ID");

  const order = await prisma.projectOrder.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: {
      id: true,
      status: true,
      projectId: true,
      createdAt: true,
      client: { select: { billingEmail: true } },
    },
  });

  if (!order || order.status !== "FULFILLED") {
    return jsonError("Checkout session is not fulfilled yet.", 409, undefined, "NOT_FULFILLED");
  }

  const purchaserEmail = order.client.billingEmail?.trim().toLowerCase();
  if (!purchaserEmail) return jsonError("No purchaser email found.", 409, undefined, "MISSING_EMAIL");

  const priorOrder = await prisma.projectOrder.findFirst({
    where: {
      id: { not: order.id },
      createdAt: { lt: order.createdAt },
      status: "FULFILLED",
      client: { billingEmail: purchaserEmail },
    },
    select: { id: true },
  });

  const appBaseUrl = getRequestOrigin(req);
  const redirectTo = priorOrder
    ? buildSigninRedirect(appBaseUrl, order.projectId)
    : buildSetPasswordRedirect(appBaseUrl, order.projectId);

  const supabaseAdmin = createSupabaseAdminClient();
  const result = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: purchaserEmail,
    options: { redirectTo },
  });

  if (result.error) {
    return jsonError(result.error.message, 500, undefined, "MAGIC_LINK_FAILED");
  }

  const actionLink = result.data?.properties?.action_link;
  if (!actionLink) return jsonError("Magic link missing", 500, undefined, "MAGIC_LINK_MISSING");

  return Response.json({ url: actionLink, flow: priorOrder ? "signin" : "setup" });
}
