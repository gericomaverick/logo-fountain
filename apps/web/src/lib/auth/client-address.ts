import { isIP } from "node:net";
import { configuredAuthProxy } from "./proxy-config.mjs";

// Client address for rate limiting, derived ONLY from explicit server-side proxy
// configuration. Route handlers cannot see the socket peer, so with no setting
// the address is unknown (null) and forwarding headers are never read: a client
// can put anything in them.
//
//   AUTH_CLIENT_IP_HEADER=x-real-ip   one header the trusted proxy OVERWRITES
//   AUTH_TRUSTED_PROXY_HOPS=1         number of trusted proxies that APPEND to
//                                     X-Forwarded-For; take that many from the right
//
// Invalid or ambiguous configuration and missing/malformed values yield unknown.
// Production auth routes refuse to serve when the result is unknown.
export function trustedClientAddress(headers: Headers, env: Record<string, string | undefined> = process.env): string | null {
  const config = configuredAuthProxy(env);
  if (!config) return null;
  if (typeof config.header === "string") {
    const value = headers.get(config.header)?.trim() ?? "";
    // The proxy must overwrite with exactly one address; a list means it appended.
    return isIP(value) ? value : null;
  }
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((part) => part.trim());
  // Entries left of the one our outermost trusted proxy appended are client-chosen.
  const hops = config.hops;
  if (typeof hops !== "number") return null;
  const value = chain.length >= hops ? chain[chain.length - hops] : "";
  return isIP(value) ? value : null;
}
