import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSignedConceptAssetUrl: vi.fn(),
  findUnique: vi.fn(),
  readStateFindUnique: vi.fn(),
  auditFindMany: vi.fn(),
  messageAggregate: vi.fn(),
  commentAggregate: vi.fn(),
}));

vi.mock("@/lib/storage/r2", () => ({ createSignedConceptAssetUrl: mocks.createSignedConceptAssetUrl }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.findUnique },
    projectReadState: { findUnique: mocks.readStateFindUnique },
    auditEvent: { findMany: mocks.auditFindMany },
    message: { aggregate: mocks.messageAggregate },
    conceptComment: { aggregate: mocks.commentAggregate },
  },
}));

import { getProjectSnapshot } from "./project-snapshot";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const CONCEPT_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-21T09:00:00.000Z");

function project() {
  return {
    id: PROJECT_ID,
    status: "CONCEPTS_READY",
    packageCode: "professional",
    createdAt: NOW,
    updatedAt: NOW,
    client: { id: "c1", name: "Acme", memberships: [] },
    orders: [],
    entitlements: [],
    briefs: [],
    briefDraft: null,
    concepts: [{ id: CONCEPT_ID, number: 1, status: "sent", notes: null, createdAt: NOW, updatedAt: NOW }],
    // Stored exactly as the admin upload writes it: project / concept / version.
    fileAssets: [{ id: "f1", kind: "concept", path: `${PROJECT_ID}/${CONCEPT_ID}/v1.png`, createdAt: NOW }],
    messages: [],
    revisionRequests: [],
    conceptComments: [],
    messageThread: null,
    _count: { auditEvents: 0 },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue(project());
  mocks.readStateFindUnique.mockResolvedValue(null);
  mocks.auditFindMany.mockResolvedValue([]);
  mocks.messageAggregate.mockResolvedValue({ _max: { createdAt: null } });
  mocks.commentAggregate.mockResolvedValue({ _max: { createdAt: null } });
});

describe("concept previews when storage misbehaves", () => {
  it("includes the signed preview when storage answers", async () => {
    mocks.createSignedConceptAssetUrl.mockResolvedValue("https://example.invalid/signed.png");

    const snapshot = await getProjectSnapshot({ projectId: PROJECT_ID, userId: "u1" });

    expect(snapshot?.concepts[0]?.imageUrl).toBe("https://example.invalid/signed.png");
  });

  it("still builds the snapshot when signing throws", async () => {
    // Unconfigured storage throws exactly this on the first call.
    mocks.createSignedConceptAssetUrl.mockRejectedValue(new Error("Missing private storage configuration: R2_ACCOUNT_ID"));

    const snapshot = await getProjectSnapshot({ projectId: PROJECT_ID, userId: "u1" });

    // The page survives with a gap in it rather than failing whole.
    expect(snapshot).not.toBeNull();
    expect(snapshot?.concepts).toHaveLength(1);
    expect(snapshot?.concepts[0]?.imageUrl).toBeNull();
    expect(snapshot?.status).toBe("CONCEPTS_READY");
  });

  it("asks for nothing when a concept has no file", async () => {
    mocks.findUnique.mockResolvedValue({ ...project(), fileAssets: [] });

    const snapshot = await getProjectSnapshot({ projectId: PROJECT_ID, userId: "u1" });

    expect(snapshot?.concepts[0]?.imageUrl).toBeNull();
    expect(mocks.createSignedConceptAssetUrl).not.toHaveBeenCalled();
  });
});
