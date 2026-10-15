import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
// The fence and every native operation use ONE PostgreSQL transaction/connection.
// Connection loss aborts both lock and writes; there is no detached-lock window.
export async function withCredentialFence<T>(userId: string, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"auth:" + userId}, 0))`;
    return run(tx);
  }, { timeout: 20000, maxWait: 5000 });
}
