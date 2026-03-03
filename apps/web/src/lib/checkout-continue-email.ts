import "server-only";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email";

type SendResult = { skipped: boolean; reason?: string };

export async function sendCheckoutContinueEmail({
  purchaserEmail,
  baseUrl,
  sessionId,
}: {
  purchaserEmail: string;
  baseUrl: string;
  sessionId: string;
}): Promise<SendResult> {
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM;

  if (!postmarkToken || !from) {
    const reason = "POSTMARK_SERVER_TOKEN or POSTMARK_FROM missing; skipping checkout continue email";
    console.warn(reason);
    return { skipped: true, reason };
  }

  const continueUrl = new URL("/checkout/continue", baseUrl);
  continueUrl.searchParams.set("session_id", sessionId);

  const subject = "Finish setting up your Logo Fountain account";
  const textBody = [
    "Thanks for your purchase.",
    "",
    "Open this link to finish account setup:",
    continueUrl.toString(),
    "",
    "You’ll be asked to set a password before entering your dashboard.",
  ].join("\n");

  const htmlBody = [
    "<p>Thanks for your purchase.</p>",
    `<p><a href=\"${continueUrl.toString()}\">Finish account setup</a></p>`,
    "<p>You’ll be asked to set a password before entering your dashboard.</p>",
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
