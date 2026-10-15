import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signOut: mocks.signOut },
  }),
}));

import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost");
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("signs the user out and returns ok", async () => {
    const res = await POST(new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost" },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
  it.each(["error", "throw"])("does not claim success on provider %s", async (failure) => {
    if (failure === "throw") mocks.signOut.mockRejectedValue(new Error("provider unavailable"));
    else mocks.signOut.mockResolvedValue({ error: { message: "provider unavailable" } });
    const res = await POST(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { origin: "http://localhost" } }));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("LOGOUT_FAILED");
  });

  it("rejects hostile provenance before sign-out", async () => {
    const res = await POST(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { origin: "https://evil.example", referer: "http://localhost/settings" } }));
    expect(res.status).toBe(403);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("supports the canonical missing-Origin Referer fallback", async () => {
    const res = await POST(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { referer: "http://localhost/settings" } }));
    expect(res.status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

});
