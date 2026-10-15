import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getConfiguredMarketingSiteOrigin,
  getPublicSiteOrigin,
  getRequestOrigin,
  getSecuritySensitivePublicOrigin,
  hasCanonicalSameOrigin,
  rejectUntrustedMutationOrigin,
} from "./request-origin";

const ORIGINAL_ENV = {
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  PUBLIC_MARKETING_SITE_URL: process.env.PUBLIC_MARKETING_SITE_URL,
  NEXT_PUBLIC_MARKETING_SITE_URL: process.env.NEXT_PUBLIC_MARKETING_SITE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  if (ORIGINAL_ENV.PUBLIC_SITE_URL === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = ORIGINAL_ENV.PUBLIC_SITE_URL;

  if (ORIGINAL_ENV.NEXT_PUBLIC_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_ENV.NEXT_PUBLIC_SITE_URL;

  if (ORIGINAL_ENV.PUBLIC_MARKETING_SITE_URL === undefined) delete process.env.PUBLIC_MARKETING_SITE_URL;
  else process.env.PUBLIC_MARKETING_SITE_URL = ORIGINAL_ENV.PUBLIC_MARKETING_SITE_URL;

  if (ORIGINAL_ENV.NEXT_PUBLIC_MARKETING_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_MARKETING_SITE_URL;
  else process.env.NEXT_PUBLIC_MARKETING_SITE_URL = ORIGINAL_ENV.NEXT_PUBLIC_MARKETING_SITE_URL;

  vi.unstubAllEnvs();
});

describe("getRequestOrigin", () => {
  it("prefers the actual request host even when env overrides are set", () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test:3000/app";
    process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.test";

    const req = new Request("http://localhost:3000/checkout/start", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "192.168.1.18:3000",
      },
    });

    expect(getRequestOrigin(req)).toBe("https://192.168.1.18:3000");
  });

  it("uses the Host header when no forwarded host is provided", () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test";

    const req = new Request("http://localhost:3000/checkout/start", {
      headers: {
        host: "127.0.0.1:3000",
      },
    });

    expect(getRequestOrigin(req)).toBe("http://127.0.0.1:3000");
  });

  it("falls back to env override when the host is 0.0.0.0", () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test:3000/app";

    const req = new Request("http://localhost:3000/checkout/start", {
      headers: {
        host: "0.0.0.0:3000",
      },
    });

    expect(getRequestOrigin(req)).toBe("https://lan.example.test:3000");
  });

  it("ignores invalid env overrides and falls back to the request URL", () => {
    process.env.PUBLIC_SITE_URL = "not a url";
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const req = new Request("http://example.test:3100/checkout/start");

    expect(getRequestOrigin(req)).toBe("http://example.test:3100");
  });
});

describe("getConfiguredMarketingSiteOrigin", () => {
  it("returns the configured marketing origin when valid", () => {
    process.env.PUBLIC_MARKETING_SITE_URL = "https://logofountain.co.uk/packages";
    process.env.NEXT_PUBLIC_MARKETING_SITE_URL = "https://fallback.example.test";

    expect(getConfiguredMarketingSiteOrigin()).toBe("https://logofountain.co.uk");
  });

  it("falls back to NEXT_PUBLIC_MARKETING_SITE_URL", () => {
    delete process.env.PUBLIC_MARKETING_SITE_URL;
    process.env.NEXT_PUBLIC_MARKETING_SITE_URL = "https://marketing.example.test/path";

    expect(getConfiguredMarketingSiteOrigin()).toBe("https://marketing.example.test");
  });
});

describe("getSecuritySensitivePublicOrigin", () => {
  it("ignores hostile Host and forwarded headers and uses canonical PUBLIC_SITE_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.PUBLIC_SITE_URL = "https://app.logofountain.test/some/path";

    const req = new Request("https://internal.example.test/api/checkout/magic-link", {
      headers: {
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "http",
      },
    });

    expect(getSecuritySensitivePublicOrigin(req)).toBe("https://app.logofountain.test");
  });

  it("fails closed in production when PUBLIC_SITE_URL is absent, invalid, or insecure", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://not-accepted.example.test";

    const hostile = new Request("https://internal.example.test/path", {
      headers: { host: "evil.example", "x-forwarded-host": "evil.example" },
    });
    expect(() => getSecuritySensitivePublicOrigin(hostile)).toThrow(/PUBLIC_SITE_URL/i);

    process.env.PUBLIC_SITE_URL = "not-a-url";
    expect(() => getSecuritySensitivePublicOrigin(hostile)).toThrow(/PUBLIC_SITE_URL/i);

    process.env.PUBLIC_SITE_URL = "http://app.example.test";
    expect(() => getSecuritySensitivePublicOrigin(hostile)).toThrow(/PUBLIC_SITE_URL/i);
  });

  it("allows only the directly invoked loopback URL as a development fallback", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.PUBLIC_SITE_URL;

    const local = new Request("http://127.0.0.1:3100/path", {
      headers: { host: "evil.example", "x-forwarded-host": "evil.example" },
    });
    expect(getSecuritySensitivePublicOrigin(local)).toBe("http://127.0.0.1:3100");

    expect(() => getSecuritySensitivePublicOrigin(new Request("https://evil.example/path"))).toThrow(/PUBLIC_SITE_URL/i);
  });
});

describe("canonical mutation Origin validation", () => {
  it("accepts only the exact configured canonical origin", () => {
    process.env.PUBLIC_SITE_URL = "https://app.example.com/path";
    const request = (origin?: string) => new Request("https://internal.example/api/profile", {
      method: "PUT",
      headers: origin ? { origin } : undefined,
    });

    expect(hasCanonicalSameOrigin(request("https://app.example.com"))).toBe(true);
    expect(rejectUntrustedMutationOrigin(request("https://app.example.com"))).toBeNull();

    for (const origin of [
      undefined,
      "null",
      "https://evil.example",
      "https://app.example.com.evil.example",
      "https://user@app.example.com",
      "https://app.example.com/path",
      "https://app.example.com?query=1",
      "https://app.example.com\\@evil.example",
      "https://app.example.com%00.evil.example",
    ]) {
      expect(hasCanonicalSameOrigin(request(origin))).toBe(false);
      expect(rejectUntrustedMutationOrigin(request(origin))?.status).toBe(403);
    }
  });
});

describe("getPublicSiteOrigin", () => {
  it("returns the env override when it is valid", () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test:3000/app";

    const req = new Request("http://localhost:3000/checkout/start", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "192.168.1.18:3000",
      },
    });

    expect(getPublicSiteOrigin(req)).toBe("https://lan.example.test:3000");
  });

  it("falls back to getRequestOrigin when no env override is set", () => {
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const req = new Request("http://localhost:3000/checkout/start", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "192.168.1.18:3000",
      },
    });

    expect(getPublicSiteOrigin(req)).toBe("https://192.168.1.18:3000");
  });
});
