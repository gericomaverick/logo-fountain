// Shared by the runtime auth boundary and the optional npm-start preflight.
// No module-load assertion: Next evaluates modules while building without runtime secrets.
/** @param {Record<string, string | undefined>} env */
export function configuredAuthProxy(env) {
  const header = env.AUTH_CLIENT_IP_HEADER?.trim().toLowerCase();
  const hops = env.AUTH_TRUSTED_PROXY_HOPS?.trim();
  if (Boolean(header) === Boolean(hops)) return null;
  if (header) {
    // Reject malformed field names; the operator must configure a header which
    // the proxy OVERWRITES, never a header passed through from the internet.
    return /^[a-z][a-z0-9-]*$/.test(header) && !["host", "origin", "referer", "cookie", "authorization"].includes(header) ? { header } : null;
  }
  return hops && /^[1-9]\d?$/.test(hops) ? { hops: Number(hops) } : null;
}
