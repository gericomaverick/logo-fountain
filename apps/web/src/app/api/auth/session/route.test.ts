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
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.isAdminUser.mockResolvedValue(false);
  });

  it("returns unauthenticated when Supabase has no user", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ authenticated: false });
    expect(mocks.isAdminUser).not.toHaveBeenCalled();
  });

  it("returns authenticated user details and admin flag", async () => {
    const user = { id: "u1", email: "admin@example.com" };
    mocks.getUser.mockResolvedValueOnce({ data: { user } });
    mocks.isAdminUser.mockResolvedValueOnce(true);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ authenticated: true, userId: "u1", email: "admin@example.com", isAdmin: true });
    expect(mocks.isAdminUser).toHaveBeenCalledWith(user);
  });
});
