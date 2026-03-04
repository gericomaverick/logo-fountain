const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getConfiguredPublicSiteOrigin(): string | null {
  const envOverride = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!envOverride) return null;

  try {
    return new URL(envOverride).origin;
  } catch {
    return null;
  }
}

export function getRequestOrigin(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto ? forwardedProto.split(",")[0].trim() : "http";

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = (forwardedHost ? forwardedHost.split(",")[0].trim() : null) ?? req.headers.get("host");
  const hostIsBound = host && host !== "0.0.0.0" && !host.startsWith("0.0.0.0:");
  const hostValue = host ? `${proto}://${host}` : null;

  const hostIsLoopback = Boolean(host && LOOPBACK_HOSTS.has(host.split(":")[0]?.toLowerCase()));
  if (hostIsBound && !hostIsLoopback) {
    return hostValue!;
  }

  const clientProvidedOrigin = parseOrigin(req.headers.get("origin")) ?? parseOrigin(req.headers.get("referer"));
  if (clientProvidedOrigin && (!hostIsBound || hostIsLoopback)) {
    return clientProvidedOrigin;
  }

  if (hostIsBound && hostValue) {
    return hostValue;
  }

  const envOrigin = getConfiguredPublicSiteOrigin();
  if (envOrigin) {
    return envOrigin;
  }

  return new URL(req.url).origin;
}

export function getPublicSiteOrigin(req: Request): string {
  return getConfiguredPublicSiteOrigin() ?? getRequestOrigin(req);
}
