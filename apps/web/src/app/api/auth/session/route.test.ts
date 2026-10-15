import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdminUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/lib/auth/admin", () => ({ isAdminUser: mocks.isAdminUser }));

import { GET } from "./route";

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    mocks.isAdminUser.mockResolvedValue(false);
  });

  it("returns unauthenticated for the documented missing-session error", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ authenticated: false });
    expect(mocks.isAdminUser).not.toHaveBeenCalled();
  });

  it("returns authenticated user details and admin flag", async () => {
    const user = { id: "u1", email: "admin@example.com" };
    mocks.getUser.mockResolvedValueOnce({ data: { user }, error: null });
    mocks.isAdminUser.mockResolvedValueOnce(true);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ authenticated: true, userId: "u1", email: "admin@example.com", isAdmin: true });
    expect(mocks.isAdminUser).toHaveBeenCalledWith(user);
  });

  it.each([
    new AuthApiError("private provider diagnostic", 500, "unexpected_failure"),
    new AuthRetryableFetchError("private network diagnostic", 503),
    new AuthApiError("private authorization diagnostic", 401, "unexpected_failure"),
  ])("does not infer absent session from returned $name", async (error) => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: {
      code: "SESSION_VERIFICATION_UNAVAILABLE", message: "Could not verify session. Please retry.",
    } });
    expect(mocks.isAdminUser).not.toHaveBeenCalled();
  });

  it("sanitizes thrown verification failure", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("private transport details"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: {
      code: "SESSION_VERIFICATION_UNAVAILABLE", message: "Could not verify session. Please retry.",
    } });
    expect(mocks.isAdminUser).not.toHaveBeenCalled();
  });

  it("does not treat an unexplained missing user as confirmed absence", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).authenticated).toBeUndefined();
  });

});
