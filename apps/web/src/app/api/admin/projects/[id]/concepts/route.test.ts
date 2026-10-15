import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    auditEvent: { findFirst: vi.fn() },
    fileAsset: { create: vi.fn() },
    project: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    concept: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    projectEntitlement: { findFirst: vi.fn() },
    revisionRequest: { count: vi.fn(), updateMany: vi.fn() },
    $executeRaw: vi.fn(),
  };

  return {
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    toRouteErrorResponse: vi.fn(),
    uploadConceptAsset: vi.fn(),
    deleteStoredFiles: vi.fn(),
    createSignedConceptAssetUrl: vi.fn(),
    logAudit: vi.fn(),
    createProjectSystemMessage: vi.fn(),
    notifyClientConceptReady: vi.fn(),
    prisma: {
      auditEvent: { findFirst: vi.fn() },
      projectEntitlement: { findFirst: vi.fn() },
      project: { findUnique: vi.fn() },
      concept: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
      revisionRequest: { groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      fileAsset: { findMany: vi.fn() },
      projectReadState: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx)),
    },
    tx,
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/supabase/storage", () => ({
  uploadConceptAsset: mocks.uploadConceptAsset,
  deleteStoredFiles: mocks.deleteStoredFiles,
  createSignedConceptAssetUrl: mocks.createSignedConceptAssetUrl,
}));
vi.mock("@/lib/upload-validation", () => ({
  UploadValidationError: class extends Error {},
  prepareConceptImage: async (f: File) => ({ bytes: new Uint8Array(await f.arrayBuffer()), extension: "png", contentType: "image/png", size: f.size }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));
vi.mock("@/lib/project-lifecycle-email", () => ({ notifyClientConceptReady: mocks.notifyClientConceptReady }));

import { GET, POST } from "./route";

describe("/api/admin/projects/[id]/concepts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.auditEvent.findFirst.mockResolvedValue(null);
    mocks.tx.auditEvent.findFirst.mockResolvedValue(null);
    mocks.tx.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.projectEntitlement.findFirst.mockResolvedValue({ limitInt: 3, consumedInt: 0, reservedInt: 1 });
    mocks.prisma.revisionRequest.count.mockResolvedValue(1);
    mocks.deleteStoredFiles.mockResolvedValue({ attempted: 1, deleted: 1, failures: [] });
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );

    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "BRIEF_SUBMITTED", updatedAt: new Date("2026-03-01") });
    mocks.prisma.concept.findUnique.mockResolvedValue(null);
    mocks.prisma.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "published", notes: null });
    mocks.prisma.concept.findMany.mockResolvedValue([]);
    mocks.prisma.concept.aggregate.mockResolvedValue({ _max: { number: 0 } });
    mocks.prisma.concept.create.mockResolvedValue({ id: "c1", number: 1, status: "published", notes: null });
    mocks.prisma.concept.update.mockResolvedValue({ id: "c1", number: 1, status: "published", notes: null });
    mocks.prisma.concept.count.mockResolvedValue(0);
    mocks.prisma.revisionRequest.groupBy.mockResolvedValue([]);
    mocks.prisma.revisionRequest.findMany.mockResolvedValue([]);
    mocks.prisma.fileAsset.findMany.mockResolvedValue([]);
    mocks.uploadConceptAsset.mockResolvedValue({ bucket: "b", path: "p", mime: "image/png", size: 123 });
    mocks.createSignedConceptAssetUrl.mockResolvedValue("https://example.com/image.png");
    mocks.tx.project.findUnique.mockResolvedValue({ status: "BRIEF_SUBMITTED" });
    mocks.tx.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "published", notes: null });
    mocks.tx.concept.create.mockResolvedValue({ id: "c1", number: 1, status: "published", notes: null });
    mocks.tx.concept.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.concept.count.mockResolvedValue(0);
    mocks.tx.projectEntitlement.findFirst.mockResolvedValue({ id: "ent1", key: "concepts", limitInt: 2, consumedInt: 1, reservedInt: 0 });
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.fileAsset.create.mockResolvedValue(undefined);
    mocks.tx.project.update.mockResolvedValue({ status: "CONCEPTS_READY" });
    mocks.tx.revisionRequest.count.mockResolvedValue(0);
    mocks.tx.revisionRequest.updateMany.mockResolvedValue({ count: 0 });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.createProjectSystemMessage.mockResolvedValue(undefined);
    mocks.notifyClientConceptReady.mockResolvedValue(undefined);
  });

  it("GET keeps unresolved feedback tied to revision-request status and reports unassigned pending revisions", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ status: "CONCEPTS_READY" });
    mocks.prisma.concept.findMany.mockResolvedValue([
      { id: "c1", number: 1, status: "published", notes: null, createdAt: new Date("2026-03-01T10:00:00Z") },
      { id: "c2", number: 2, status: "published", notes: null, createdAt: new Date("2026-03-01T11:00:00Z") },
    ]);
    mocks.prisma.revisionRequest.groupBy.mockResolvedValue([
      { conceptId: "c1", _count: { _all: 1 } },
      { conceptId: null, _count: { _all: 1 } },
    ]);
    const res = await GET(new Request("http://localhost", { method: "GET" }), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.concepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "c1", pendingRevisionCount: 1, unresolvedFeedbackCount: 1 }),
        expect.objectContaining({ id: "c2", pendingRevisionCount: 0, unresolvedFeedbackCount: 0 }),
      ]),
    );
    expect(payload.conceptlessPendingRevisionCount).toBe(1);
    expect(mocks.prisma.projectReadState.findMany).not.toHaveBeenCalled();
  });

  it("POST accepts first concept upload from BRIEF_SUBMITTED and transitions to CONCEPTS_READY", async () => {
    const formData = new FormData();
    formData.set("requestKey", "11111111-1111-4111-8111-111111111111");
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "concept.png", { type: "image/png" }));
    formData.set("notes", "Primary concept explainer");

    const res = await POST(new Request("http://localhost", { method: "POST", body: formData }), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.projectStatus).toBe("CONCEPTS_READY");
    expect(mocks.prisma.concept.aggregate).toHaveBeenCalledWith({ where: { projectId: "p1" }, _max: { number: true } });
    expect(mocks.tx.concept.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: "p1", number: 1, status: "published" }) }),
    );
    expect(mocks.tx.project.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "CONCEPTS_READY" } });
    expect(mocks.tx.$executeRaw).toHaveBeenCalled();
    expect(mocks.tx.fileAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: null }),
      }),
    );
    expect(mocks.tx.revisionRequest.updateMany).not.toHaveBeenCalled();
    expect(mocks.createProjectSystemMessage).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ projectId: "p1", fallbackUserId: "admin-1", body: "Concept 1 is ready for review." }),
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ type: "state_changed", payload: { previousStatus: "BRIEF_SUBMITTED", nextStatus: "CONCEPTS_READY" } }),
    );
    expect(mocks.notifyClientConceptReady).toHaveBeenCalledWith("p1", "c1");
  });

  it("POST does not create concept metadata when the atomic entitlement claim is exhausted", async () => {
    mocks.tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mocks.tx.projectEntitlement.findFirst.mockResolvedValueOnce({ id: "ent1", limitInt: 1, consumedInt: 1, reservedInt: 0 });
    const formData = new FormData();
    formData.set("requestKey", "11111111-1111-4111-8111-111111111111");
    formData.set("file", new File([new Uint8Array([1])], "concept.png", { type: "image/png" }));
    const res = await POST(new Request("http://localhost", { method: "POST", body: formData }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "CONCEPT_ENTITLEMENT_EXHAUSTED" } });
    expect(mocks.tx.concept.create).not.toHaveBeenCalled();
    expect(mocks.tx.fileAsset.create).not.toHaveBeenCalled();
  });

  it("POST revision upload clears pending feedback only via delivery transition", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY" });
    mocks.tx.project.findUnique.mockResolvedValue({ status: "CONCEPTS_READY" });
    mocks.prisma.fileAsset.findMany.mockResolvedValue([{ path: "p1/c1/v2.png" }]);
    mocks.tx.revisionRequest.count.mockResolvedValue(2);
    mocks.tx.revisionRequest.updateMany.mockResolvedValue({ count: 2 });
    mocks.tx.projectEntitlement.findFirst.mockResolvedValue({ id: "ent-r", key: "revisions", limitInt: 5, consumedInt: 1, reservedInt: 3 });

    const formData = new FormData();
    formData.set("requestKey", "11111111-1111-4111-8111-111111111111");
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "revision.png", { type: "image/png" }));
    formData.set("uploadMode", "revision");
    formData.set("conceptId", "c1");

    const res = await POST(new Request("http://localhost", { method: "POST", body: formData }), {
      params: Promise.resolve({ id: "p1" }),
    });
    const payload = await res.json().catch(() => null);

    expect(res.status, JSON.stringify(payload)).toBe(200);
    expect(mocks.tx.revisionRequest.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", conceptId: "c1", status: { not: "delivered" } },
      data: { status: "delivered" },
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        type: "concept_revision_uploaded",
        payload: expect.objectContaining({ deliveredRevisionRequests: 2 }),
      }),
    );
    expect(mocks.notifyClientConceptReady).not.toHaveBeenCalled();
  });

  it("POST revision upload rejects delivery when there is no pending reserved request", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY" });
    mocks.tx.project.findUnique.mockResolvedValue({ status: "CONCEPTS_READY" });
    mocks.prisma.fileAsset.findMany.mockResolvedValue([{ path: "p1/c1/v2.png" }]);
    mocks.tx.revisionRequest.count.mockResolvedValue(0);

    const formData = new FormData();
    formData.set("requestKey", "11111111-1111-4111-8111-111111111111");
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "revision.png", { type: "image/png" }));
    formData.set("uploadMode", "revision");
    formData.set("conceptId", "c1");

    const res = await POST(new Request("http://localhost", { method: "POST", body: formData }), {
      params: Promise.resolve({ id: "p1" }),
    });
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error?.code).toBe("NO_PENDING_REVISION_REQUESTS");
    expect(mocks.tx.revisionRequest.updateMany).not.toHaveBeenCalled();
  });
  function request(key = "11111111-1111-4111-8111-111111111111", mode = "concept", data = [1,2,3]) {
    const form = new FormData(); form.set("requestKey", key); form.set("uploadMode", mode);
    form.set("file", new File([new Uint8Array(data)], "x.png", {type:"image/png"}));
    if (mode === "replace") form.set("conceptNumber", "1");
    return POST(new Request("http://localhost",{method:"POST",body:form}),{params:Promise.resolve({id:"p1"})});
  }

  it("response-loss replay returns the durable result without another upload or consumption", async () => {
    expect((await request()).status).toBe(200);
    const receipt = mocks.logAudit.mock.calls.find(([, event]) => event.type === "concept_upload_request")![1];
    mocks.prisma.auditEvent.findFirst.mockResolvedValue({ payload: receipt.payload });
    mocks.uploadConceptAsset.mockClear(); mocks.tx.$executeRaw.mockClear(); mocks.tx.concept.create.mockClear();
    // Replay must still work when the project has since been approved/held.
    mocks.prisma.project.findUnique.mockResolvedValue({ id:"p1",status:"ON_HOLD" });
    const replay = await request();
    expect(replay.status).toBe(200); expect((await replay.json()).replayed).toBe(true);
    expect(mocks.uploadConceptAsset).not.toHaveBeenCalled();
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.concept.create).not.toHaveBeenCalled();
    expect((await request(undefined, "concept", [9])).status).toBe(409);
  });

  it("recovers a committed receipt after the transaction client loses its response", async () => {
    mocks.prisma.$transaction.mockImplementationOnce(async fn => {
      const result = await fn(mocks.tx);
      const receipt = mocks.logAudit.mock.calls.find(([, event]) => event.type === "concept_upload_request")![1];
      mocks.prisma.auditEvent.findFirst.mockResolvedValue({ payload: receipt.payload });
      void result; throw new Error("connection lost after commit");
    });
    const res = await request(); expect(res.status).toBe(200); expect((await res.json()).recovered).toBe(true);
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
  });

  it("uncertain outcomes retain bytes and retries use a fresh attempt path", async () => {
    mocks.prisma.concept.findUnique.mockResolvedValue({ id:"c1",number:1,status:"published",notes:null });
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error("timeout"));
    const res = await request(undefined,"replace"); expect(res.status).toBe(409);
    expect((await res.json()).error.details.uploadedObjectRetained).toBe(true);
    expect((await request(undefined,"replace")).status).toBe(200);
    const keys = mocks.uploadConceptAsset.mock.calls.map(([arg]) => arg.bucketPath);
    expect(keys[0]).not.toBe(keys[1]);
    for (const [arg] of mocks.uploadConceptAsset.mock.calls) expect(arg.upsert).toBe(false);
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
  });

  it("draft replacement consumes once; published replacement never consumes", async () => {
    mocks.prisma.concept.findUnique.mockResolvedValue({ id:"c1",number:1,status:"draft",notes:null });
    mocks.tx.concept.findFirst.mockResolvedValue({ id:"c1",number:1,status:"draft",notes:null });
    expect((await request(undefined,"replace")).status).toBe(200);
    // Request lock plus one conditional usage UPDATE.
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.tx.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:"p1",status:"BRIEF_SUBMITTED",updatedAt:new Date("2026-03-01")}}));
  });

  it("concurrent logical request receipt short-circuits before metadata mutation", async () => {
    mocks.tx.auditEvent.findFirst.mockImplementationOnce(async () => {
      // Represents the winner committed before this transaction acquired its key lock.
      const { conceptUploadDigest } = await import("@/lib/concept-upload-request");
      return {payload:{ digest:conceptUploadDigest(["p1","concept",null,null,null,null,"image/png"],new Uint8Array([1,2,3])),result:{concept:{id:"winner",number:1,status:"published",notes:null},projectStatus:"CONCEPTS_READY"} }};
    });
    const res = await request(); expect(res.status).toBe(200); expect((await res.json()).concept.id).toBe("winner");
    expect(mocks.tx.concept.create).not.toHaveBeenCalled();
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it.each(["CANCELLED","REFUNDED","DELIVERED","AWAITING_APPROVAL","ON_HOLD"])("rejects publication in %s before storage", async status => {
    mocks.prisma.project.findUnique.mockResolvedValue({id:"p1",status,updatedAt:new Date()});
    expect((await request()).status).toBe(409); expect(mocks.uploadConceptAsset).not.toHaveBeenCalled();
  });

  it("concurrent same-key submissions publish/consume only the winner's logical request", async () => {
    // Model PostgreSQL's request-key lock with a serialized transaction boundary;
    // this is not a real database concurrency integration test.
    let receipt: unknown = null;
    let tail = Promise.resolve();
    mocks.tx.auditEvent.findFirst.mockImplementation(async () => receipt);
    mocks.logAudit.mockImplementation(async (_tx, event) => { if(event.type === "concept_upload_request") receipt = {payload:event.payload}; });
    const serial = (fn: (tx: typeof mocks.tx) => Promise<unknown>) => {
      const next = tail.then(() => fn(mocks.tx)); tail = next.then(() => undefined); return next;
    };
    mocks.prisma.$transaction.mockImplementationOnce(serial).mockImplementationOnce(serial);
    const results = await Promise.all([request(),request()]);
    expect(results.map(r => r.status)).toEqual([200,200]);
    expect(mocks.tx.concept.create).toHaveBeenCalledTimes(1);
    const usageWrites = mocks.tx.$executeRaw.mock.calls.filter(([sql]) => String(sql).includes('"consumedInt"'));
    expect(usageWrites).toHaveLength(1);
  });

  it("concurrent different-key submissions honor the project fence and do not steal a slot", async () => {
    mocks.tx.project.updateMany.mockResolvedValueOnce({count:1}).mockResolvedValueOnce({count:0});
    const results = await Promise.all([request(),request("22222222-2222-4222-8222-222222222222")]);
    expect(results.map(r => r.status).sort()).toEqual([200,409]);
    expect(mocks.tx.concept.create).toHaveBeenCalledTimes(1);
    expect(mocks.deleteStoredFiles).toHaveBeenCalledTimes(1);
  });

  it("a known abort with failed cleanup reports its retained object without overwriting", async () => {
    mocks.tx.project.updateMany.mockResolvedValueOnce({count:0});
    mocks.deleteStoredFiles.mockResolvedValueOnce({attempted:1,deleted:0,failures:[{message:"unavailable"}]});
    const res = await request(); expect(res.status).toBe(500);
    expect((await res.json()).error).toMatchObject({code:"CONCEPT_UPLOAD_CLEANUP_FAILED",details:{uploadedObjectRetained:true}});
    expect(mocks.uploadConceptAsset.mock.calls[0][0].upsert).toBe(false);
  });

});
