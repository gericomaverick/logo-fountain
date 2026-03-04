import { afterEach, describe, expect, it } from "vitest";

import { getRequestOrigin } from "./request-origin";

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
  it("prefers PUBLIC_SITE_URL over NEXT_PUBLIC_SITE_URL", () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test:3000/app";
    process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.test";

    const req = new Request("http://localhost:3000/api/checkout/session");

    expect(getRequestOrigin(req)).toBe("https://lan.example.test:3000");
  });

  it("uses NEXT_PUBLIC_SITE_URL when PUBLIC_SITE_URL is missing", () => {
    delete process.env.PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.test/path";

    const req = new Request("http://localhost:3000/api/checkout/session");

    expect(getRequestOrigin(req)).toBe("https://public.example.test");
  });

  it("falls back to forwarded host/proto when env vars are missing", () => {
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const req = new Request("http://localhost:3000/api/checkout/session", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "192.168.1.18:3000",
      },
    });

    expect(getRequestOrigin(req)).toBe("https://192.168.1.18:3000");
  });
});
