import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendCheckoutContinueEmail } from "./checkout-continue-email";

const ORIGINAL_ENV = {
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
  POSTMARK_FROM: process.env.POSTMARK_FROM,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key as keyof typeof process.env];
    } else {
      process.env[key as keyof typeof process.env] = value;
    }
  }
}

describe("sendCheckoutContinueEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    process.env.POSTMARK_SERVER_TOKEN = "test-token";
    process.env.POSTMARK_FROM = "noreply@example.com";
  });

  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
  });

  it("prefers PUBLIC_SITE_URL over the provided base URL", async () => {
    process.env.PUBLIC_SITE_URL = "https://lan.example.test:3100";

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendCheckoutContinueEmail({
      purchaserEmail: "buyer@example.com",
      baseUrl: "http://localhost:3000",
      sessionId: "cs_test",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.TextBody).toContain("https://lan.example.test:3100/checkout/continue?session_id=cs_test&flow=setup");
  });

  it("falls back to the provided base URL when no env override exists", async () => {
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendCheckoutContinueEmail({
      purchaserEmail: "buyer@example.com",
      baseUrl: "https://app.local.test:4000",
      sessionId: "cs_test",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.TextBody).toContain("https://app.local.test:4000/checkout/continue?session_id=cs_test&flow=setup");
  });

  it("uses returning-customer copy and signin flow links when flow=signin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendCheckoutContinueEmail({
      purchaserEmail: "buyer@example.com",
      baseUrl: "https://app.local.test:4000",
      sessionId: "cs_test",
      flow: "signin",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.Subject).toBe("Your new Logo Fountain project is ready");
    expect(body.TextBody).toContain("/checkout/continue?session_id=cs_test&flow=signin");
    expect(body.TextBody).toContain("sign in and access your new project");
    expect(body.TextBody).not.toContain("set a password");
  });
});
