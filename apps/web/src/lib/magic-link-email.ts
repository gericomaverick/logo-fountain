import "server-only";
import { requestAuthLink } from "@/lib/auth/service";
import { getSecuritySensitivePublicOrigin } from "@/lib/request-origin";
export async function generateAndSendMagicLinkEmail({ purchaserEmail, request, projectId, flow = "signin" }: { purchaserEmail: string; request?: Request; projectId?: string | null; flow?: "setup" | "signin" }) {
  getSecuritySensitivePublicOrigin(request);
  if (!process.env.POSTMARK_SERVER_TOKEN || !process.env.POSTMARK_FROM) return { skipped: true, reason: "Authentication email delivery is not configured" };
  await requestAuthLink(purchaserEmail, flow === "setup" ? "setup" : "magic", projectId ? `/project/${projectId}` : "/dashboard", request?.headers);
  return { skipped: false };
}
