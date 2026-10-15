import { AuthFailure } from "./errors";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";
import { consumeAuthLimit } from "./rate-limit";

export function authJson(body: unknown, status = 200, native?: Response) {
  const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  for (const cookie of native?.headers.getSetCookie() || []) headers.append("set-cookie", cookie);
  return Response.json(body, { status, headers });
}
export async function authMutation(req: Request, run: (body: Record<string, unknown>) => Promise<Response>) {
  const origin = rejectUntrustedMutationOrigin(req);
  if (origin) return origin;
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) return authJson({ error: { code: "INVALID_JSON" } }, 400);
  try {
    // Enforce the byte budget WHILE reading, not after allocating the full body.
    const reader = req.body?.getReader();
    const decoder = new TextDecoder();
    let raw = "", bytes = 0;
    if (reader) while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) { await reader.cancel(); return authJson({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AuthFailure();
    return await run(body as Record<string, unknown>);
  } catch (error) {
    // Never expose native diagnostics, user existence, passwords or bearer data.
    return authJson({ error: { code: error instanceof AuthFailure ? error.code : "AUTH_FAILED", message: "Authentication could not be completed. Check your details or request a new link." } }, error instanceof AuthFailure ? error.status : 400);
  }
}
export const text = (value: unknown) => typeof value === "string" ? value : "";
export async function allowAuthAttempt(req: Request, identity: string) {
  const address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return consumeAuthLimit(new URL(req.url).pathname, address, identity.toLowerCase());
}
