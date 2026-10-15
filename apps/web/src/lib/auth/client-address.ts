import { isIP } from "node:net";

// Client address for rate limiting, derived ONLY from explicit server-side proxy
// configuration. Route handlers cannot see the socket peer, so with no setting
// the address is unknown (null) and forwarding headers are never read: a client
// can put anything in them.
//
//   AUTH_CLIENT_IP_HEADER=x-real-ip   one header the trusted proxy OVERWRITES
//   AUTH_TRUSTED_PROXY_HOPS=1         number of trusted proxies that APPEND to
//                                     X-Forwarded-For; take that many from the right
//
// Setting both is a configuration error (fails closed to unknown).
export function trustedClientAddress(headers: Headers, env: Record<string, string | undefined> = process.env): string | null {
  const header = env.AUTH_CLIENT_IP_HEADER?.trim().toLowerCase();
  const hopsSetting = env.AUTH_TRUSTED_PROXY_HOPS?.trim();
  if (header && hopsSetting) return null;
  if (header) {
    const value = headers.get(header)?.trim() ?? "";
    // The proxy must overwrite with exactly one address; a list means it appended.
    return isIP(value) ? value : null;
  }
  if (!hopsSetting) return null;
  if (!/^[1-9]\d?$/.test(hopsSetting)) return null;
  const hops = Number(hopsSetting);
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  // Entries left of the one our outermost trusted proxy appended are client-chosen.
  const value = chain.length >= hops ? chain[chain.length - hops] : "";
  return isIP(value) ? value : null;
}
