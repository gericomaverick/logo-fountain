import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  retrieveSession: vi.fn(),
  fulfillCheckoutSession: vi.fn(),
  ensureAccessProvisioning: vi.fn(),
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: mocks.retrieveSession,
      },
    },
  },
}));

vi.mock("@/lib/checkout-fulfillment", () => ({
  ORDER_STATUS_FULFILLED: "FULFILLED",
  ORDER_STATUS_NEEDS_CONTACT: "NEEDS_CONTACT",
  fulfillCheckoutSession: mocks.fulfillCheckoutSession,
  ensureAccessProvisioning: mocks.ensureAccessProvisioning,
}));

import { POST } from "./route";

describe("POST /api/admin/checkout/reprocess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockImplementation((error: unknown) => {
      const routeError = error as { message?: string; code?: string; status?: number };
      if (typeof routeError?.status === "number") {
        return Response.json(
          { error: { message: routeError.message ?? "Route error", code: routeError.code ?? "UNKNOWN" } },
          { status: routeError.status },
        );
      }
      return Response.json({ error: { message: "Unexpected", code: "UNKNOWN" } }, { status: 500 });
    });
  });

  it("returns forbidden for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValueOnce({ message: "Forbidden", status: 403, code: "FORBIDDEN" });

    const res = await POST(
      new Request("http://localhost/api/admin/checkout/reprocess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "cs_test" }),
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("validates missing session_id", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/checkout/reprocess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("Missing session_id");
  });

  it("reprocesses session and provisions access", async () => {
    mocks.retrieveSession.mockResolvedValue({ id: "cs_ok" });
    mocks.fulfillCheckoutSession.mockResolvedValue({
      deduped: false,
      projectId: "project-1",
      orderId: "order-1",
      clientId: "client-1",
      purchaserEmail: "buyer@example.com",
    });
    mocks.ensureAccessProvisioning.mockResolvedValue({ userId: "user-1" });

    const res = await POST(
      new Request("http://localhost/api/admin/checkout/reprocess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "cs_ok" }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deduped).toBe(false);
    expect(body.orderStatus).toBe("FULFILLED");
    expect(mocks.fulfillCheckoutSession).toHaveBeenCalledWith({ id: "cs_ok" });
    expect(mocks.ensureAccessProvisioning).toHaveBeenCalledWith("client-1", "buyer@example.com");
  });

  it("supports idempotent safe re-run", async () => {
    mocks.retrieveSession.mockResolvedValue({ id: "cs_ok" });
    mocks.fulfillCheckoutSession.mockResolvedValue({
      deduped: true,
      projectId: "project-1",
      orderId: "order-1",
      clientId: "client-1",
      purchaserEmail: "buyer@example.com",
    });
    mocks.ensureAccessProvisioning.mockResolvedValue({ userId: "user-1" });

    const res = await POST(
      new Request("http://localhost/api/admin/checkout/reprocess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "cs_ok" }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduped).toBe(true);
    expect(body.message).toContain("already fulfilled");
    expect(mocks.ensureAccessProvisioning).toHaveBeenCalledTimes(1);
  });
});
