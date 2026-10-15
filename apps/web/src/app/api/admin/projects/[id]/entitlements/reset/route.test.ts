import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: () => Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
}));
import { POST } from "./route";

describe("standalone entitlement usage reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
  });

  it("still requires an authenticated admin", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    const res = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(403);
  });

  it("is disabled so counters cannot diverge from active lifecycle records", async () => {
    const res = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "ENTITLEMENT_USAGE_RESET_DISABLED" } });
  });
});
