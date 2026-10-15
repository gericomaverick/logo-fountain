import { afterEach, describe, expect, it, vi } from "vitest";
import { logoutAndVerifySession } from "./logout";

afterEach(() => vi.unstubAllGlobals());

describe("logout confirmation", () => {
  it.each([403, 503, 502])("does not report success for HTTP %i", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({}, { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(logoutAndVerifySession()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([true, undefined])("does not report success when session is active or unknown (%s)", async (authenticated) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ authenticated })));
    await expect(logoutAndVerifySession()).rejects.toThrow(/session may still be active/);
  });

  it("cannot confirm logout when session verification returns non-success", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ok: true }))
      // Even an authenticated:false payload must not override failed verification.
      .mockResolvedValueOnce(Response.json({ authenticated: false, error: {
        code: "SESSION_VERIFICATION_UNAVAILABLE",
      } }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(logoutAndVerifySession()).rejects.toThrow("Could not confirm sign-out. Please retry.");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("propagates network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(logoutAndVerifySession()).rejects.toThrow("offline");
  });

  it("confirms success only after a fresh unauthenticated session response", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ authenticated: false }));
    vi.stubGlobal("fetch", fetcher);
    await expect(logoutAndVerifySession()).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenLastCalledWith("/api/auth/session", { cache: "no-store" });
  });
});
