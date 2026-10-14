import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ auth: { resetPasswordForEmail: mocks.resetPasswordForEmail } }),
}));

import { resetForgotPasswordLimitForTests } from "@/lib/forgot-password-rate-limit";
import { POST } from "./route";

const originalPublicSiteUrl = process.env.PUBLIC_SITE_URL;

function request(headers?: HeadersInit) {
  return new Request("https://internal.example.test/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ email: "Buyer@Example.com" }),
  });
}

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetForgotPasswordLimitForTests();
    process.env.PUBLIC_SITE_URL = "https://app.example.com";
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalPublicSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = originalPublicSiteUrl;
  });

  it("uses the canonical origin despite hostile host headers", async () => {
    const res = await POST(request({
      host: "evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    }));

    expect(res.status).toBe(200);
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("buyer@example.com", {
      redirectTo: "https://app.example.com/auth/callback?next=%2Freset-password",
    });
  });

  it("rate limits repeated attempts while preserving the uniform anti-enumeration response", async () => {
    const responses = [];
    for (let index = 0; index < 7; index += 1) {
      responses.push(await POST(request({ "x-forwarded-for": "203.0.113.10" })));
    }

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(5);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        message: "If that account exists, a password recovery email has been sent.",
      });
    }
  });

  it("fails closed in production without PUBLIC_SITE_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PUBLIC_SITE_URL;

    const res = await POST(request({ host: "evil.example", "x-forwarded-host": "evil.example" }));

    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("RECOVERY_UNAVAILABLE");
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
