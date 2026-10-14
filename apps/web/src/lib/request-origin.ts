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
