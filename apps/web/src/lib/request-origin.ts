export function getRequestOrigin(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto ? forwardedProto.split(",")[0].trim() : "http";

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = (forwardedHost ? forwardedHost.split(",")[0].trim() : null) ?? req.headers.get("host");

  const hostIsBound = host && host !== "0.0.0.0" && !host.startsWith("0.0.0.0:");
  if (hostIsBound) {
    return `${proto}://${host}`;
  }

  const envOverride = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (envOverride) {
    try {
      return new URL(envOverride).origin;
    } catch {
      // ignore invalid overrides and continue to the final fallback
    }
  }

  return new URL(req.url).origin;
}
