import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireProjectMembership: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  prisma: {
    project: { findUnique: vi.fn() },
    projectBriefDraft: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { DELETE, GET, PUT } from "./route";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const params = Promise.resolve({ id: PROJECT_ID });

const request = (body?: unknown, origin = "https://app.example.test") =>
  new Request(`https://internal.invalid/api/projects/${PROJECT_ID}/brief/draft`, {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.PUBLIC_SITE_URL = "https://app.example.test";
  mocks.requireUser.mockResolvedValue({ id: USER_ID });
  mocks.requireProjectMembership.mockResolvedValue({ id: PROJECT_ID });
  mocks.toRouteErrorResponse.mockImplementation(() => new Response("{}", { status: 500 }));
});

describe("GET brief draft", () => {
  it("returns null when nothing has been saved yet", async () => {
    mocks.prisma.projectBriefDraft.findUnique.mockResolvedValue(null);

    const response = await GET(new Request("https://internal.invalid/x"), { params });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft: null });
  });

  it("returns saved answers, filled out to the full shape", async () => {
    mocks.prisma.projectBriefDraft.findUnique.mockResolvedValue({
      answers: { brandName: "Acme" },
      updatedAt: new Date("2026-10-18T10:00:00.000Z"),
    });

    const response = await GET(new Request("https://internal.invalid/x"), { params });
    const body = await response.json();

    expect(body.draft.answers.brandName).toBe("Acme");
    // A key the customer never reached still comes back, empty.
    expect(body.draft.answers.additionalNotes).toBe("");
  });

  it("drops a draft stored in a shape that no longer parses", async () => {
    mocks.prisma.projectBriefDraft.findUnique.mockResolvedValue({ answers: "not an object", updatedAt: new Date() });

    const response = await GET(new Request("https://internal.invalid/x"), { params });

    await expect(response.json()).resolves.toEqual({ draft: null });
  });

  it("is scoped to project membership, so an unsubmitted brief stays private", async () => {
    await GET(new Request("https://internal.invalid/x"), { params });

    expect(mocks.requireProjectMembership).toHaveBeenCalledWith(USER_ID, PROJECT_ID);
  });
});

describe("PUT brief draft", () => {
  it("saves answers while the project is still awaiting the brief", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, status: "AWAITING_BRIEF" });
    mocks.prisma.projectBriefDraft.upsert.mockResolvedValue({ updatedAt: new Date("2026-10-18T10:00:00.000Z") });

    const response = await PUT(request({ answers: { brandName: "Acme" } }), { params });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(mocks.prisma.projectBriefDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: PROJECT_ID } }),
    );
  });

  it("refuses once the brief has been submitted", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, status: "BRIEF_SUBMITTED" });

    const response = await PUT(request({ answers: { brandName: "Acme" } }), { params });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "BRIEF_LOCKED" } });
    expect(mocks.prisma.projectBriefDraft.upsert).not.toHaveBeenCalled();
  });

  it("rejects a payload that is not a brief", async () => {
    const response = await PUT(request({ answers: "nope" }), { params });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_BRIEF_DRAFT_PAYLOAD" } });
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin write before touching the database", async () => {
    const response = await PUT(request({ answers: { brandName: "Acme" } }, "https://evil.example"), { params });

    expect(response.status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.prisma.projectBriefDraft.upsert).not.toHaveBeenCalled();
  });
});

describe("DELETE brief draft", () => {
  it("discards the draft", async () => {
    mocks.prisma.projectBriefDraft.deleteMany.mockResolvedValue({ count: 1 });

    const response = await DELETE(request(), { params });

    expect(response.status).toBe(200);
    expect(mocks.prisma.projectBriefDraft.deleteMany).toHaveBeenCalledWith({ where: { projectId: PROJECT_ID } });
  });

  it("treats discarding an absent draft as success", async () => {
    mocks.prisma.projectBriefDraft.deleteMany.mockResolvedValue({ count: 0 });

    const response = await DELETE(request(), { params });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects a cross-origin delete", async () => {
    const response = await DELETE(request(undefined, "https://evil.example"), { params });

    expect(response.status).toBe(403);
    expect(mocks.prisma.projectBriefDraft.deleteMany).not.toHaveBeenCalled();
  });
});
