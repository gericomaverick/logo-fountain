import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const concept = { findFirst: vi.fn(), count: vi.fn(), update: vi.fn() };
  const project = { findUnique: vi.fn(), update: vi.fn() };
  const tx = { concept, project };

  return {
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    logAudit: vi.fn(),
    createProjectSystemMessage: vi.fn(),
    notifyClientConceptReady: vi.fn(),
    prisma: {
      concept,
      project,
      $transaction: vi.fn(async (fn: (tx: { concept: typeof concept; project: typeof project }) => Promise<unknown>) => fn(tx)),
    },
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: (error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: { message } }, { status: 500 });
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));
vi.mock("@/lib/project-lifecycle-email", () => ({ notifyClientConceptReady: mocks.notifyClientConceptReady }));

import { POST } from "./route";

describe("POST /api/admin/projects/[id]/concepts/[conceptId]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.concept.findFirst.mockResolvedValue({ id: "c1", number: 1 });
    mocks.prisma.concept.count.mockResolvedValue(0);
    mocks.prisma.project.findUnique.mockResolvedValue({ status: "BRIEF_SUBMITTED" });
    mocks.prisma.concept.update.mockResolvedValue({ id: "c1", number: 1, status: "published" });
    mocks.prisma.project.update.mockResolvedValue({ status: "CONCEPTS_READY" });
  });

  it("triggers client concept-ready email after publish", async () => {
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "p1", conceptId: "c1" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.notifyClientConceptReady).toHaveBeenCalledWith("p1", "c1");
  });
});
