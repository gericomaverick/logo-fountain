import { requestAuthLink } from "@/lib/auth/service";
import { allowAuthAttempt, authJson, authMutation, text } from "@/lib/auth/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return authMutation(req, async (body) => {
    const email = text(body.email).trim().toLowerCase();
    if (email.includes("@") && await allowAuthAttempt(req, email)) {
      try { await requestAuthLink(email, "magic", text(body.next), req.headers); } catch { /* indistinguishable delivery/account failure */ }
    }
    return authJson({ ok: true, message: "If that account exists, a sign-in link has been sent." });
  });
}
