import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ auth: { resetPasswordForEmail: mocks.resetPasswordForEmail } }),
}));

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

  it("fails closed in production without PUBLIC_SITE_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PUBLIC_SITE_URL;

    const res = await POST(request({ host: "evil.example", "x-forwarded-host": "evil.example" }));

    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("RECOVERY_UNAVAILABLE");
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
