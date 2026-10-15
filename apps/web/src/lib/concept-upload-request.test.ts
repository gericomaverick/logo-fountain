import { describe, expect, it, vi } from "vitest";
import { conceptUploadDigest, findConceptUploadRequest } from "./concept-upload-request";
import type { Prisma } from "@/generated/prisma/client";

describe("durable concept upload receipts", () => {
  it("binds action/target/notes and bytes, not just a caller key", () => {
    const bytes = new Uint8Array([1,2,3]);
    const digest = conceptUploadDigest(["p1","concept",null],bytes);
    expect(conceptUploadDigest(["p1","replace","c1"],bytes)).not.toBe(digest);
    expect(conceptUploadDigest(["p2","concept",null],bytes)).not.toBe(digest);
    expect(conceptUploadDigest(["p1","concept",null],new Uint8Array([1,2,4]))).not.toBe(digest);
  });
  it("returns committed result and rejects mismatched replay", async () => {
    const findFirst = vi.fn().mockResolvedValue({ payload: { requestKey:"key", digest:"hash", result:{ concept:{id:"c1"}, projectStatus:"CONCEPTS_READY" } } });
    const db = { auditEvent:{findFirst} } as unknown as Pick<Prisma.TransactionClient,"auditEvent">;
    await expect(findConceptUploadRequest(db,"p1","key","hash")).resolves.toMatchObject({concept:{id:"c1"}});
    await expect(findConceptUploadRequest(db,"p1","key","different")).rejects.toThrow("different upload");
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId:"p1",type:"concept_upload_request",payload:{path:["requestKey"],equals:"key"} } }));
  });
});
