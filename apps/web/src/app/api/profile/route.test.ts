import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  prisma: {
    profile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { GET, PUT } from "./route";

describe("/api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "client@example.com" });
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );
    mocks.prisma.profile.findUnique.mockResolvedValue({
      id: "u1",
      email: "client@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
    });
    mocks.prisma.profile.upsert.mockResolvedValue({
      id: "u1",
      email: "client@example.com",
      firstName: "Grace",
      lastName: "Hopper",
      fullName: "Grace Hopper",
    });
  });

  it("GET returns the stored profile with auth fallback available", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profile).toEqual({
      id: "u1",
      email: "client@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
    });
  });

  it("GET falls back to the authenticated user email when no profile exists", async () => {
    mocks.prisma.profile.findUnique.mockResolvedValueOnce(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profile).toEqual({
      id: "u1",
      email: "client@example.com",
      firstName: null,
      lastName: null,
      fullName: null,
    });
  });

  it("PUT trims names, updates fullName, and preserves omitted fields", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "  Grace  " }),
    });

    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(mocks.prisma.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        create: expect.objectContaining({ firstName: "Grace", lastName: "Lovelace", fullName: "Grace Lovelace" }),
        update: { firstName: "Grace", fullName: "Grace Lovelace" },
      }),
    );
  });

  it("PUT rejects invalid JSON and non-string name fields", async () => {
    const invalidJson = await PUT(new Request("http://localhost/api/profile", { method: "PUT", body: "{nope" }));
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error.code).toBe("INVALID_JSON");

    const invalidName = await PUT(
      new Request("http://localhost/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: 123 }),
      }),
    );
    expect(invalidName.status).toBe(400);
    expect((await invalidName.json()).error.code).toBe("INVALID_FIRST_NAME");
    expect(mocks.prisma.profile.upsert).not.toHaveBeenCalled();
  });
});
