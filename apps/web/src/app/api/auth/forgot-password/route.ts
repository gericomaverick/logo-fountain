import { jsonError } from "@/lib/api-error";
import { consumeForgotPasswordLimit } from "@/lib/forgot-password-rate-limit";
import { getSecuritySensitivePublicOrigin } from "@/lib/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  const payload = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return jsonError("Enter a valid email address.", 400, undefined, "INVALID_EMAIL");
  }

  let redirectTo: string;
  try {
    const callback = new URL("/auth/callback", getSecuritySensitivePublicOrigin(req));
    callback.searchParams.set("next", "/reset-password");
    redirectTo = callback.toString();
  } catch {
    return jsonError("Password recovery is temporarily unavailable.", 503, undefined, "RECOVERY_UNAVAILABLE");
  }

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || req.headers.get("x-real-ip")?.trim() || "unknown";
  const allowed = consumeForgotPasswordLimit({ address, email });

  if (allowed) {
    try {
      const supabase = createSupabaseAdminClient();
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    } catch {
      // Keep account existence and provider details out of the public response.
    }
  }

  // Rate-limited, unknown-account, provider-error and successful requests are
  // deliberately indistinguishable to prevent account enumeration.
  return Response.json({ ok: true, message: "If that account exists, a password recovery email has been sent." });
}
