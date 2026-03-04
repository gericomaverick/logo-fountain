import { afterEach, describe, expect, it } from "vitest";

import { getPublicSiteOrigin, getRequestOrigin } from "./request-origin";

const ORIGINAL_ENV = {
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};

afterEach(() => {
  if (ORIGINAL_ENV.PUBLIC_SITE_URL === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = ORIGINAL_ENV.PUBLIC_SITE_URL;

  if (ORIGINAL_ENV.NEXT_PUBLIC_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_ENV.NEXT_PUBLIC_SITE_URL;
});

describe("getRequestOrigin", () => {
  it("prefers the actual request host even when env overrides are set", () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test:3000/app";
    process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.test";

    const req = new Request("http://localhost:3000/api/checkout/session", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "192.168.1.18:3000",
      },
    });

    expect(getRequestOrigin(req)).toBe("https://192.168.1.18:3000");
  });

  it("uses the Host header when no forwarded host is provided", () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test";

    const req = new Request("http://localhost:3000/api/checkout/session", {
      headers: {
        host: "127.0.0.1:3000",
      },
    });

    expect(getRequestOrigin(req)).toBe("http://127.0.0.1:3000");
  });

  it("falls back to env override when the host is 0.0.0.0", () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test:3000/app";

    const req = new Request("http://localhost:3000/api/checkout/session", {
      headers: {
        host: "0.0.0.0:3000",
      },
    });

    expect(getRequestOrigin(req)).toBe("https://lan.example.test:3000");
  });

  it("uses the Origin header when the host only reports localhost", () => {
    const req = new Request("http://localhost:3000/api/checkout/session", {
      headers: {
        host: "localhost:3000",
        origin: "http://192.168.0.10:3000",
      },
    });

    expect(getRequestOrigin(req)).toBe("http://192.168.0.10:3000");
  });

  it("falls back to the Referer when Origin is missing and the host is localhost", () => {
    const req = new Request("http://localhost:3000/api/checkout/session", {
      headers: {
        host: "127.0.0.1:3000",
        referer: "http://192.168.0.10:3000/checkout/continue",
      },
    });

    expect(getRequestOrigin(req)).toBe("http://192.168.0.10:3000");
  });

  it("ignores invalid env overrides and falls back to the request URL", () => {
    process.env.PUBLIC_SITE_URL = "not a url";
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const req = new Request("http://example.test:3100/api/checkout/session");

    expect(getRequestOrigin(req)).toBe("http://example.test:3100");
  });
});

describe("getPublicSiteOrigin", () => {
  it("returns the env override when it is valid", () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test:3000/app";

    const req = new Request("http://localhost:3000/api/checkout/session", {
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

    const req = new Request("http://localhost:3000/api/checkout/session", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "192.168.1.18:3000",
      },
    });

    expect(getPublicSiteOrigin(req)).toBe("https://192.168.1.18:3000");
  });
});
