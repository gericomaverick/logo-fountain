import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

export class UploadReplayMismatch extends Error {}
export function conceptUploadDigest(fields: unknown[], bytes: Uint8Array) {
  return createHash("sha256").update(JSON.stringify(fields)).update(bytes).digest("hex");
}
export async function findConceptUploadRequest(db: Pick<Prisma.TransactionClient, "auditEvent">, projectId: string, key: string, digest: string) {
  const event = await db.auditEvent.findFirst({
    where: { projectId, type: "concept_upload_request", payload: { path: ["requestKey"], equals: key } },
    orderBy: { createdAt: "desc" },
  });
  if (!event) return null;
  const record = event.payload as { digest?: string; result?: Prisma.JsonValue };
  if (record.digest !== digest) throw new UploadReplayMismatch("Request key was already used for different upload content/action");
  if (!record.result) throw new Error("Invalid durable upload receipt");
  return record.result;
}
