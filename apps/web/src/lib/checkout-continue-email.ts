import "server-only";

import { renderBrandedEmail } from "@/lib/email-branding";
import { getSecuritySensitivePublicOrigin } from "@/lib/request-origin";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email";

type SendResult = { skipped: boolean; reason?: string };

export async function sendCheckoutContinueEmail({
  purchaserEmail,
  request,
  sessionId,
  flow = "setup",
}: {
  purchaserEmail: string;
  request?: Request;
  sessionId: string;
  flow?: "setup" | "signin";
}): Promise<SendResult> {
  const continueUrl = new URL("/checkout/continue", getSecuritySensitivePublicOrigin(request));
  continueUrl.searchParams.set("session_id", sessionId);
  continueUrl.searchParams.set("flow", flow);

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM;

  if (!postmarkToken || !from) {
    const reason = "POSTMARK_SERVER_TOKEN or POSTMARK_FROM missing; skipping checkout continue email";
    console.warn(reason);
    return { skipped: true, reason };
  }

  const isReturning = flow === "signin";
  const subject = isReturning ? "Your new Logo Fountain project is ready" : "Finish setting up your Logo Fountain account";
  const textBody = isReturning
    ? [
        "Thanks for your purchase.",
        "",
        "Open this link to sign in and access your new project:",
        continueUrl.toString(),
      ].join("\n")
    : [
        "Thanks for your purchase.",
        "",
        "Open this link to finish account setup:",
        continueUrl.toString(),
        "",
        "You’ll be asked to set a password before entering your dashboard.",
      ].join("\n");

  const htmlBody = renderBrandedEmail({
    heading: subject,
    intro: isReturning
      ? "Thanks for your purchase. Sign in to access your new project and jump straight into your dashboard."
      : "Thanks for your purchase. Finish account setup to create your password and access your dashboard.",
    ctaLabel: isReturning ? "Sign in to access your new project" : "Finish account setup",
    ctaUrl: continueUrl.toString(),
    footer: "This secure link is tied to your latest Logo Fountain order.",
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
      To: purchaserEmail,
      Subject: subject,
      TextBody: textBody,
      HtmlBody: htmlBody,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Postmark send failed (${response.status}): ${body}`);
  }

  return { skipped: false };
}
