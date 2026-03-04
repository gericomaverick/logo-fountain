import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAuthCallbackRedirect } from "@/lib/supabase/password-redirects";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email";

type MagicLinkSendResult = {
  skipped: boolean;
  reason?: string;
  actionLink?: string;
};

async function generateMagicLink({
  email,
  baseUrl,
  projectId,
}: {
  email: string;
  baseUrl: string;
  projectId?: string | null;
}) {
  const supabaseAdmin = createSupabaseAdminClient();
  const redirectTo = buildAuthCallbackRedirect(baseUrl, { projectId, email });

  const result = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (result.error) {
    throw new Error(`Failed to generate Supabase magic link: ${result.error.message}`);
  }

  const actionLink = result.data?.properties?.action_link;
  if (!actionLink) throw new Error("Supabase did not return action_link for magic link");

  return actionLink;
}

async function sendPostmarkEmail({
  to,
  actionLink,
}: {
  to: string;
  actionLink: string;
}): Promise<MagicLinkSendResult> {
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM;

  if (!postmarkToken || !from) {
    const reason = "POSTMARK_SERVER_TOKEN or POSTMARK_FROM missing; skipping magic-link email send";
    console.warn(reason);
    return { skipped: true, reason, actionLink };
  }

  const subject = "Your Logo Fountain sign-in link";
  const textBody = [
    "Thanks for your purchase.",
    "",
    "Use this secure sign-in link to continue:",
    actionLink,
    "",
    "After signing in, you'll be asked to set your password before entering your dashboard.",
  ].join("\n");

  const htmlBody = [
    "<p>Thanks for your purchase.</p>",
    `<p><a href=\"${actionLink}\">Use this secure sign-in link</a> to continue.</p>`,
    "<p>After signing in, you&apos;ll be asked to set your password before entering your dashboard.</p>",
  ].join("");

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
    const body = await response.text();
    throw new Error(`Postmark send failed (${response.status}): ${body}`);
  }

  return { skipped: false, actionLink };
}

export async function generateAndSendMagicLinkEmail({
  purchaserEmail,
  baseUrl,
  projectId,
}: {
  purchaserEmail: string;
  baseUrl: string;
  projectId?: string | null;
}): Promise<MagicLinkSendResult> {
  const actionLink = await generateMagicLink({ email: purchaserEmail, baseUrl, projectId });
  return sendPostmarkEmail({ to: purchaserEmail, actionLink });
}
