import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  verifyUserPassword: vi.fn(),
  logAudit: vi.fn(),
  updateUserById: vi.fn(),
  adminSignOut: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/auth/verify-password", () => ({ verifyUserPassword: mocks.verifyUserPassword }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { updateUserById: mocks.updateUserById, signOut: mocks.adminSignOut } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getSession: mocks.getSession } }),
}));

import { POST } from "./route";

function request(body: unknown, raw = false) {
  return new Request("http://localhost/api/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe("POST /api/auth/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "user@example.com" });
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );
    mocks.verifyUserPassword.mockResolvedValue(true);
    mocks.updateUserById.mockResolvedValue({ error: null });
    mocks.adminSignOut.mockResolvedValue({ error: null });
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it("changes the password after verifying the current one", async () => {
    const res = await POST(request({ currentPassword: "old-password", newPassword: "brand-new-password" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.verifyUserPassword).toHaveBeenCalledWith("user@example.com", "old-password");
    expect(mocks.updateUserById).toHaveBeenCalledWith("u1", { password: "brand-new-password" });
    expect(mocks.adminSignOut).toHaveBeenCalledWith("tok", "others");
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: "u1", type: "auth.password_changed" }),
    );
  });

  it("rejects an incorrect current password without updating", async () => {
    mocks.verifyUserPassword.mockResolvedValueOnce(false);

    const res = await POST(request({ currentPassword: "wrong", newPassword: "brand-new-password" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CURRENT_PASSWORD_INVALID");
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("requires the current password", async () => {
    const res = await POST(request({ currentPassword: "", newPassword: "brand-new-password" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CURRENT_PASSWORD_REQUIRED");
    expect(mocks.verifyUserPassword).not.toHaveBeenCalled();
  });

  it("rejects a weak new password", async () => {
    const res = await POST(request({ currentPassword: "old-password", newPassword: "short" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("WEAK_PASSWORD");
    expect(mocks.verifyUserPassword).not.toHaveBeenCalled();
  });

  it("rejects reusing the current password", async () => {
    const res = await POST(request({ currentPassword: "same-password", newPassword: "same-password" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("PASSWORD_UNCHANGED");
    expect(mocks.verifyUserPassword).not.toHaveBeenCalled();
  });

  it("surfaces a rejected password from Supabase policy", async () => {
    mocks.updateUserById.mockResolvedValueOnce({ error: { message: "Password is known to be weak." } });

    const res = await POST(request({ currentPassword: "old-password", newPassword: "brand-new-password" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("PASSWORD_UPDATE_FAILED");
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("still succeeds when revoking other sessions fails", async () => {
    mocks.adminSignOut.mockRejectedValueOnce(new Error("network"));

    const res = await POST(request({ currentPassword: "old-password", newPassword: "brand-new-password" }));

    expect(res.status).toBe(200);
    expect(mocks.updateUserById).toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalled();
  });

  it("rejects accounts without password sign-in", async () => {
    mocks.requireUser.mockResolvedValueOnce({ id: "u1", email: null });

    const res = await POST(request({ currentPassword: "old-password", newPassword: "brand-new-password" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("NO_PASSWORD_LOGIN");
  });

  it("rejects invalid JSON", async () => {
    const res = await POST(request("{nope", true));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });
});
