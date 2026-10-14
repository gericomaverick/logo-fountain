import { jsonError } from "@/lib/api-error";
import { getSecuritySensitivePublicOrigin } from "@/lib/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
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

  try {
    const supabase = createSupabaseAdminClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // Keep account existence and provider details out of the public response.
  }

  return Response.json({ ok: true, message: "If that account exists, a password recovery email has been sent." });
}
