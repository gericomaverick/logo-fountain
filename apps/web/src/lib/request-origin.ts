export class PublicSiteConfigurationError extends Error {
  readonly code = "PUBLIC_SITE_URL_REQUIRED";

  constructor() {
    super("A valid canonical PUBLIC_SITE_URL is required for security-sensitive redirects.");
    this.name = "PublicSiteConfigurationError";
  }
}

function parseOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getConfiguredPublicSiteOrigin(): string | null {
  return parseOrigin(process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL);
}

export function getConfiguredMarketingSiteOrigin(): string | null {
  return parseOrigin(process.env.PUBLIC_MARKETING_SITE_URL || process.env.NEXT_PUBLIC_MARKETING_SITE_URL);
}

export function getRequestOrigin(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto ? forwardedProto.split(",")[0].trim() : "http";

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = (forwardedHost ? forwardedHost.split(",")[0].trim() : null) ?? req.headers.get("host");

  const hostIsBound = host && host !== "0.0.0.0" && !host.startsWith("0.0.0.0:");
  if (hostIsBound) {
    return `${proto}://${host}`;
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

function isSafeLocalOrigin(origin: URL): boolean {
  return (
    (origin.protocol === "http:" || origin.protocol === "https:") &&
    (origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.hostname === "[::1]")
  );
}

/**
 * Origin for auth and other bearer-bearing email links.
 *
 * Production deliberately accepts only the server-side PUBLIC_SITE_URL. Request,
 * Host and forwarded headers are never considered. Development may use the URL
 * the local server was directly invoked with, but only for loopback hosts.
 */
export function hasCanonicalSameOrigin(req: Request): boolean {
  const supplied = req.headers.get("origin");
  if (!supplied || supplied === "null" || /[\u0000-\u001f\u007f]/.test(supplied)) return false;

  try {
    const parsed = new URL(supplied);
    // Origin is an origin serialization, never a URL with credentials, path,
    // query, or fragment. Requiring the canonical serialization also rejects
    // ambiguous values that a permissive URL parser might otherwise normalize.
    if (supplied !== parsed.origin || parsed.username || parsed.password) return false;
    return parsed.origin === getSecuritySensitivePublicOrigin(req);
  } catch {
    return false;
  }
}

export function rejectUntrustedMutationOrigin(req: Request): Response | null {
  if (hasCanonicalSameOrigin(req)) return null;
  return Response.json(
    { error: { code: "INVALID_ORIGIN", message: "Request origin is not allowed." } },
    { status: 403 },
  );
}

export function getSecuritySensitivePublicOrigin(req?: Request): string {
  const configured = parseOrigin(process.env.PUBLIC_SITE_URL);
  if (configured) {
    const url = new URL(configured);
    if (process.env.NODE_ENV !== "production" || url.protocol === "https:") return configured;
    throw new PublicSiteConfigurationError();
  }

  if (process.env.NODE_ENV !== "production") {
    if (!req) return "http://localhost:3000";
    const requestUrl = new URL(req.url);
    if (isSafeLocalOrigin(requestUrl)) return requestUrl.origin;
  }

  throw new PublicSiteConfigurationError();
}
