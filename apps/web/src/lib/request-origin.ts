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
