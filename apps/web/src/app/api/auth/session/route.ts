import { sessionFromHeaders } from "@/lib/auth/service";
import { isAdminUser } from "@/lib/auth/admin";
import { authJson, authProxyUnavailable } from "@/lib/auth/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const proxy = authProxyUnavailable(req);
  if (proxy) return proxy;
  try {
    const result = await sessionFromHeaders(req.headers);
    if (!result) return authJson({ authenticated: false });
    return authJson({ authenticated: true, userId: result.user.id, email: result.user.email, isAdmin: await isAdminUser(result.user) });
  } catch { return authJson({ error: { code: "SESSION_VERIFICATION_UNAVAILABLE", message: "Could not verify session. Please retry." } }, 503); }
}
