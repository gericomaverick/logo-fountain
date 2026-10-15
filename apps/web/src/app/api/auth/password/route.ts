import { changeCredential } from "@/lib/auth/service";
import { allowAuthAttempt, authJson, authMutation, text } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/require";
import { getAuth } from "@/lib/auth/server";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return authMutation(req, async (body) => {
    const user = await requireUser();
    if (!(await allowAuthAttempt(req, user.id))) return authJson({ error: { code: "RATE_LIMITED" } }, 429);
    await changeCredential(text(body.currentPassword), text(body.newPassword), req.headers);
    const response = await getAuth().api.signOut({ headers: req.headers, asResponse: true });
    return authJson({ ok: true, signedOut: true }, 200, response);
  });
}
