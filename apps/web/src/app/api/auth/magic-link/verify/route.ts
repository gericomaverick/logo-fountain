import { verifyMagic } from "@/lib/auth/service";
import { allowAuthAttempt, authJson, authMutation, text } from "@/lib/auth/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return authMutation(req, async (body) => {
    if (!(await allowAuthAttempt(req, text(body.token)))) return authJson({ error: { code: "RATE_LIMITED" } }, 429);
    return authJson({ ok: true }, 200, await verifyMagic(text(body.token), req.headers));
  });
}
