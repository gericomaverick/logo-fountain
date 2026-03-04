import { jsonError } from "@/lib/api-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { getRequestOrigin } from "@/lib/request-origin";
import { applyMagicLinkRedirectOverride } from "@/lib/supabase/action-link";

export const runtime = "nodejs";

type Body = { session_id?: unknown };

function parseSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildSetPasswordRedirect(baseUrl: string, projectId?: string | null): string {
  const redirect = new URL("/set-password", baseUrl);
  redirect.searchParams.set("next", "/dashboard");
  if (projectId) redirect.searchParams.set("projectId", projectId);
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
      status: true,
      projectId: true,
      client: { select: { billingEmail: true } },
    },
  });

  if (!order || order.status !== "FULFILLED") {
    return jsonError("Checkout session is not fulfilled yet.", 409, undefined, "NOT_FULFILLED");
  }

  const purchaserEmail = order.client.billingEmail?.trim().toLowerCase();
  if (!purchaserEmail) return jsonError("No purchaser email found.", 409, undefined, "MISSING_EMAIL");

  const appBaseUrl = getRequestOrigin(req);
  const redirectTo = buildSetPasswordRedirect(appBaseUrl, order.projectId);

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

  const finalActionLink = applyMagicLinkRedirectOverride(actionLink, redirectTo);
  if (result.data?.properties) {
    result.data.properties.redirect_to = redirectTo;
  }

  return Response.json({ url: finalActionLink });
}
