import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type LogAuditInput = {
  projectId?: string | null;
  actorId?: string | null;
  type: string;
  payload?: Prisma.InputJsonValue;
};

export async function logAudit(prisma: PrismaLike, input: LogAuditInput) {
  return prisma.auditEvent.create({
    data: {
      projectId: input.projectId ?? null,
      actorId: input.actorId ?? null,
      type: input.type,
      payload: input.payload ?? {},
    },
  });
}
