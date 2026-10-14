import "server-only";

import { renderBrandedEmail } from "@/lib/email-branding";
import { getSecuritySensitivePublicOrigin } from "@/lib/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email";

type MagicLinkSendResult = {
  skipped: boolean;
  reason?: string;
};

type MagicLinkFlow = "setup" | "signin";

function buildAuthCallbackRedirect(baseUrl: string, projectId: string | null | undefined, flow: MagicLinkFlow): string {
  const destination = projectId ? `/project/${projectId}` : "/dashboard";
  const callback = new URL("/auth/callback", baseUrl);

  if (flow === "setup") {
    const setPassword = new URL("/set-password", baseUrl);
    setPassword.searchParams.set("next", destination);
    callback.searchParams.set("next", `${setPassword.pathname}${setPassword.search}`);
  } else {
    callback.searchParams.set("next", destination);
  }

  return callback.toString();
}

async function generateMagicLink({
  email,
  baseUrl,
  projectId,
  flow,
}: {
  email: string;
  baseUrl: string;
  projectId?: string | null;
  flow: MagicLinkFlow;
}) {
  const supabaseAdmin = createSupabaseAdminClient();
  const redirectTo = buildAuthCallbackRedirect(baseUrl, projectId, flow);

  const result = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (result.error) {
    throw new Error("Authentication provider could not generate a sign-in link");
  }

  const actionLink = result.data?.properties?.action_link;
  if (!actionLink) throw new Error("Authentication provider did not generate a sign-in link");

  return actionLink;
}

async function sendPostmarkEmail({
  to,
  actionLink,
  flow,
}: {
  to: string;
  actionLink: string;
  flow: MagicLinkFlow;
}): Promise<MagicLinkSendResult> {
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM;
  if (!postmarkToken || !from) throw new Error("Authentication email delivery is not configured");

  const isSetup = flow === "setup";
  const subject = isSetup ? "Finish setting up your Logo Fountain account" : "Your Logo Fountain sign-in link";
  const textBody = [
    "Thanks for your purchase.",
    "",
    isSetup ? "Use this secure link to finish account setup:" : "Use this secure link to sign in:",
    actionLink,
    ...(isSetup ? ["", "After signing in, you'll be asked to set your password."] : []),
  ].join("\n");

  const htmlBody = renderBrandedEmail({
    heading: subject,
    intro: isSetup
      ? "Thanks for your purchase. Use this secure link to finish access setup."
      : "Thanks for your purchase. Use this secure link to sign in and access your project.",
    ctaLabel: isSetup ? "Finish account setup" : "Sign in to Logo Fountain",
    ctaUrl: actionLink,
    footer: isSetup
      ? "After signing in, you'll be prompted to set your password."
      : "If you did not request this email, you can safely ignore it.",
  });

  const response = await fetch(POSTMARK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Postmark-Server-Token": postmarkToken,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: subject,
      TextBody: textBody,
      HtmlBody: htmlBody,
    }),
  });

  if (!response.ok) {
    // Never read/propagate the provider response body: it may echo the submitted
    // email body and therefore the generated bearer URL.
    throw new Error(`Authentication email delivery failed (${response.status})`);
  }

  return { skipped: false };
}

export async function generateAndSendMagicLinkEmail({
  purchaserEmail,
  request,
  projectId,
  flow = "signin",
}: {
  purchaserEmail: string;
  request?: Request;
  projectId?: string | null;
  flow?: MagicLinkFlow;
}): Promise<MagicLinkSendResult> {
  // Resolve the canonical origin before generating any credential. Production
  // fails closed when PUBLIC_SITE_URL is missing/invalid/insecure.
  const baseUrl = getSecuritySensitivePublicOrigin(request);

  if (!process.env.POSTMARK_SERVER_TOKEN || !process.env.POSTMARK_FROM) {
    const reason = "Authentication email delivery is not configured";
    console.warn(reason);
    return { skipped: true, reason };
  }

  const actionLink = await generateMagicLink({ email: purchaserEmail, baseUrl, projectId, flow });
  return sendPostmarkEmail({ to: purchaserEmail, actionLink, flow });
}
