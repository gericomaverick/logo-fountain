import { login } from "@/lib/auth/service";
import { allowAuthAttempt, authJson, authMutation, text } from "@/lib/auth/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return authMutation(req, async (body) => {
    const email = text(body.email).trim().toLowerCase();
    const password = text(body.password);
    if (!email || !password || new TextEncoder().encode(password).length > 72 || !(await allowAuthAttempt(req, email))) return authJson({ error: { code: "INVALID_CREDENTIALS" } }, 400);
    const result = await login(email, password, req.headers);
    return result.ok ? authJson({ ok: true }, 200, result) : authJson({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect, or mailbox verification is required." } }, 400);
  });
}
