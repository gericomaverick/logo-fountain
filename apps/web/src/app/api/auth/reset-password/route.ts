import { resetCredential } from "@/lib/auth/service";
import { allowAuthAttempt, authJson, authMutation, text } from "@/lib/auth/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return authMutation(req, async (body) => {
    if (!(await allowAuthAttempt(req, text(body.token)))) return authJson({ error: { code: "RATE_LIMITED" } }, 429);
    await resetCredential(text(body.token), text(body.newPassword), req.headers);
    return authJson({ ok: true });
  });
}
