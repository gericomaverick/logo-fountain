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

function hasCanonicalProvenance(req: Request, canonical: string): boolean {
  const supplied = req.headers.get("origin");
  // An explicit Origin always takes precedence, including null/empty/hostile
  // values. A Referer must never rescue a failed Origin check.
  if (supplied !== null) {
    try {
      const parsed = new URL(supplied);
      return supplied === parsed.origin && parsed.origin === canonical;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (!referer || /[\u0000-\u001f\u007f\\]/.test(referer)) return false;
  try {
    const parsed = new URL(referer);
    return referer.startsWith(`${canonical}/`) && parsed.origin === canonical &&
      !parsed.username && !parsed.password && !parsed.hash;
  } catch {
    return false;
  }
}

export function hasCanonicalSameOrigin(req: Request): boolean {
  try {
    return hasCanonicalProvenance(req, getSecuritySensitivePublicOrigin(req));
  } catch {
    return false;
  }
}

export function rejectUntrustedMutationOrigin(req: Request): Response | null {
  let canonical: string;
  try {
    canonical = getSecuritySensitivePublicOrigin(req);
  } catch {
    return Response.json(
      { error: { code: "PUBLIC_SITE_URL_REQUIRED", message: "Request validation is temporarily unavailable." } },
      { status: 503 },
    );
  }
  if (hasCanonicalProvenance(req, canonical)) return null;
  return Response.json(
    { error: { code: "INVALID_ORIGIN", message: "Request origin is not allowed." } },
    { status: 403 },
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
  const configuredValue = process.env.PUBLIC_SITE_URL;
  const configured = parseOrigin(configuredValue);
  if (configuredValue) {
    try {
      const url = new URL(configuredValue);
      if (!configured || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new PublicSiteConfigurationError();
      }
    } catch {
      throw new PublicSiteConfigurationError();
    }
  }
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
