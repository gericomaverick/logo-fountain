import { describe, expect, it } from "vitest";
import { trustedClientAddress } from "./client-address";

const h = (init: Record<string, string>) => new Headers(init);
const spoof = { "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.10", "cf-connecting-ip": "203.0.113.11" };

describe("trusted client address", () => {
  it("never reads forwarding headers without trusted-proxy config", () => {
    expect(trustedClientAddress(h(spoof), {})).toBeNull();
    expect(trustedClientAddress(h({ "x-forwarded-for": "203.0.113.9, 198.51.100.7" }), {})).toBeNull();
  });
  it("with N trusted appending hops, takes the Nth entry from the right; client-chosen left entries are ignored", () => {
    const chain = h({ "x-forwarded-for": "203.0.113.9, 192.0.2.44, 198.51.100.7" });
    expect(trustedClientAddress(chain, { AUTH_TRUSTED_PROXY_HOPS: "1" })).toBe("198.51.100.7");
    expect(trustedClientAddress(chain, { AUTH_TRUSTED_PROXY_HOPS: "2" })).toBe("192.0.2.44");
    // Changing the spoofed left-most value does not change the result.
    expect(trustedClientAddress(h({ "x-forwarded-for": "10.9.9.9, 192.0.2.44, 198.51.100.7" }), { AUTH_TRUSTED_PROXY_HOPS: "1" })).toBe("198.51.100.7");
  });
  it("fails closed when the chain is shorter than the trusted hops or the hop setting is invalid", () => {
    expect(trustedClientAddress(h({ "x-forwarded-for": "198.51.100.7" }), { AUTH_TRUSTED_PROXY_HOPS: "2" })).toBeNull();
    expect(trustedClientAddress(h({}), { AUTH_TRUSTED_PROXY_HOPS: "1" })).toBeNull();
    for (const bad of ["0", "-1", "one", "1.5", "100"]) expect(trustedClientAddress(h({ "x-forwarded-for": "198.51.100.7" }), { AUTH_TRUSTED_PROXY_HOPS: bad })).toBeNull();
  });
  it("with a named overwritten header, uses only that header and only a single valid IP", () => {
    expect(trustedClientAddress(h(spoof), { AUTH_CLIENT_IP_HEADER: "CF-Connecting-IP" })).toBe("203.0.113.11");
    expect(trustedClientAddress(h({ "x-forwarded-for": "198.51.100.7" }), { AUTH_CLIENT_IP_HEADER: "x-real-ip" })).toBeNull();
    expect(trustedClientAddress(h({ "x-real-ip": "203.0.113.9, 198.51.100.7" }), { AUTH_CLIENT_IP_HEADER: "x-real-ip" })).toBeNull();
    expect(trustedClientAddress(h({ "x-real-ip": "2001:db8::1" }), { AUTH_CLIENT_IP_HEADER: "x-real-ip" })).toBe("2001:db8::1");
  });
  it("treats configuring both modes as an error and trusts neither", () => {
    expect(trustedClientAddress(h(spoof), { AUTH_CLIENT_IP_HEADER: "x-real-ip", AUTH_TRUSTED_PROXY_HOPS: "1" })).toBeNull();
  });
});
