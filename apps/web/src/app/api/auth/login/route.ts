import { login } from "@/lib/auth/service";
import { authJson, authMutation, text } from "@/lib/auth/http";
import { trustedClientAddress } from "@/lib/auth/client-address";
import { clearLoginFailures, reserveLoginAttempt } from "@/lib/auth/rate-limit";
export const runtime = "nodejs";
const invalid = () => authJson({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect, or mailbox verification is required." } }, 400);
export async function POST(req: Request) {
  return authMutation(req, async (body) => {
    const email = text(body.email).trim().toLowerCase();
    const password = text(body.password);
    if (!email || !password || new TextEncoder().encode(password).length > 72) return invalid();
    const address = trustedClientAddress(req.headers);
    // Limited, wrong and unknown-account attempts all get the same generic response.
    if (!(await reserveLoginAttempt(address, email))) return invalid();
    const result = await login(email, password, req.headers);
    if (!result.ok) return invalid();
    await clearLoginFailures(address, email);
    return authJson({ ok: true }, 200, result);
  });
}
