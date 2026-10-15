import "server-only";
import { renderBrandedEmail } from "@/lib/email-branding";
const POSTMARK_API_URL = "https://api.postmarkapp.com/email";
type MagicLinkFlow = "setup" | "signin" | "reset";
type MagicLinkSendResult = { skipped: boolean; reason?: string };
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
  const subject = flow === "reset" ? "Reset your Logo Fountain password" : isSetup ? "Finish setting up your Logo Fountain account" : "Your Logo Fountain sign-in link";
  const textBody = [
    "Your Logo Fountain account",
    "",
    flow === "reset" ? "Use this secure link to reset your password:" : isSetup ? "Use this secure link to finish account setup:" : "Use this secure link to sign in:",
    actionLink,
    ...(isSetup ? ["", "Choose a password, then sign in. This link expires in one hour and can be used once."] : []),
  ].join("\n");

  const htmlBody = renderBrandedEmail({
    heading: subject,
    intro: flow === "reset" ? "Use this single-use link within one hour to reset your password. All sessions will be revoked." : isSetup
      ? "Thanks for your purchase. Use this secure link to finish access setup."
      : "Thanks for your purchase. Use this secure link to sign in and access your project.",
    ctaLabel: flow === "reset" ? "Reset password" : isSetup ? "Finish account setup" : "Sign in to Logo Fountain",
    ctaUrl: actionLink,
    footer: isSetup
      ? "Set your password with this one-hour, single-use mailbox proof, then sign in."
      : "If you did not request this email, you can safely ignore it.",
  });

  const response = await fetch(POSTMARK_API_URL, {
    signal: AbortSignal.timeout(10000),
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


export async function sendAuthEmail(to: string, actionLink: string, flow: MagicLinkFlow) {
  await sendPostmarkEmail({ to, actionLink, flow });
}
