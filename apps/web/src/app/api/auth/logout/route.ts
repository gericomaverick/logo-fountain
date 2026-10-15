import { getAuth } from "@/lib/auth/server";
import { authJson } from "@/lib/auth/http";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const origin = rejectUntrustedMutationOrigin(req);
  if (origin) return origin;
  try {
    const result = await getAuth().api.signOut({ headers: req.headers, asResponse: true });
    if (!result.ok) throw new Error("signout failed");
    return authJson({ ok: true }, 200, result);
  } catch { return authJson({ error: { code: "LOGOUT_FAILED", message: "Could not sign out. Please retry." } }, 503); }
}
