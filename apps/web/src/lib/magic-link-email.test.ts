import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateLink: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { generateLink: mocks.generateLink } },
  }),
}));

import { generateAndSendMagicLinkEmail } from "./magic-link-email";

const originalEnv = {
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
  POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
  POSTMARK_FROM: process.env.POSTMARK_FROM,
};

function hostileRequest() {
  return new Request("https://internal.example.test/api/checkout/magic-link", {
    headers: {
      host: "evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    },
  });
}

describe("generateAndSendMagicLinkEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBLIC_SITE_URL = "https://app.example.com";
    process.env.POSTMARK_SERVER_TOKEN = "test-token";
    process.env.POSTMARK_FROM = "noreply@example.com";
    mocks.generateLink.mockResolvedValue({
      error: null,
      data: { properties: { action_link: "https://auth.example.com/secret-bearer-link" } },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses canonical password setup only when trusted provisioning explicitly selects setup", async () => {
    const result = await generateAndSendMagicLinkEmail({
      purchaserEmail: "new@example.com",
      request: hostileRequest(),
      projectId: "project-new",
      flow: "setup",
    });

    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "new@example.com",
      options: {
        redirectTo: "https://app.example.com/auth/callback?next=%2Fset-password%3Fnext%3D%252Fproject%252Fproject-new",
      },
    });
    expect(result).toEqual({ skipped: false });
    expect(result).not.toHaveProperty("actionLink");
  });

  it("routes existing-account links directly through sign-in without password setup", async () => {
    await generateAndSendMagicLinkEmail({
      purchaserEmail: "admin@example.com",
      request: hostileRequest(),
      projectId: "project-existing",
      flow: "signin",
    });

    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "admin@example.com",
      options: {
        redirectTo: "https://app.example.com/auth/callback?next=%2Fproject%2Fproject-existing",
      },
    });
  });

  it("does not generate a credential when canonical origin or email delivery is unavailable", async () => {
    delete process.env.PUBLIC_SITE_URL;
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      generateAndSendMagicLinkEmail({ purchaserEmail: "buyer@example.com", request: hostileRequest() }),
    ).rejects.toMatchObject({ code: "PUBLIC_SITE_URL_REQUIRED" });
    expect(mocks.generateLink).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
    process.env.PUBLIC_SITE_URL = "https://app.example.com";
    delete process.env.POSTMARK_SERVER_TOKEN;
    await expect(
      generateAndSendMagicLinkEmail({ purchaserEmail: "buyer@example.com", request: hostileRequest() }),
    ).resolves.toMatchObject({ skipped: true });
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it("never reads a provider failure body that could echo the bearer URL", async () => {
    const text = vi.fn().mockResolvedValue("https://auth.example.com/secret-bearer-link");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text }));

    await expect(
      generateAndSendMagicLinkEmail({ purchaserEmail: "buyer@example.com", request: hostileRequest() }),
    ).rejects.toThrow("Authentication email delivery failed (500)");
    expect(text).not.toHaveBeenCalled();
  });
});
