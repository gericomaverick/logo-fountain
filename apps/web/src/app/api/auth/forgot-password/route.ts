import { requestAuthLink } from "@/lib/auth/service";
import { allowAuthAttempt, authJson, authMutation, text } from "@/lib/auth/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return authMutation(req, async (body) => {
    const email = text(body.email).trim().toLowerCase();
    if (!email || !email.includes("@")) return authJson({ error: { code: "INVALID_EMAIL", message: "Enter a valid email address." } }, 400);
    if (await allowAuthAttempt(req, email)) {
      try { await requestAuthLink(email, "reset", "/dashboard", req.headers); } catch { /* no enumeration or provider diagnostics */ }
    }
    return authJson({ ok: true, message: "If that account exists, a password recovery email has been sent." });
  });
}
