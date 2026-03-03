import type { Prisma } from "../generated/prisma/client";

function getAdminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function getSystemSenderId(tx: Prisma.TransactionClient, fallbackUserId: string): Promise<string> {
  const adminByFlag = await tx.profile.findFirst({ where: { isAdmin: true }, select: { id: true } });
  if (adminByFlag?.id) return adminByFlag.id;

  const adminEmails = getAdminEmailAllowlist();
  if (adminEmails.length > 0) {
    const adminByEmail = await tx.profile.findFirst({
      where: { email: { in: adminEmails } },
      select: { id: true },
    });
    if (adminByEmail?.id) return adminByEmail.id;
  }

  return fallbackUserId;
}

export async function createProjectSystemMessage(
  tx: Prisma.TransactionClient,
  params: { projectId: string; fallbackUserId: string; body: string },
): Promise<void> {
  const thread = await tx.messageThread.upsert({
    where: { projectId: params.projectId },
    update: {},
    create: { projectId: params.projectId },
    select: { id: true },
  });

  const existing = await tx.message.findFirst({
    where: {
      threadId: thread.id,
      kind: "system",
      body: params.body,
    },
    select: { id: true },
  });

  if (existing) return;

  const senderId = await getSystemSenderId(tx, params.fallbackUserId);

  await tx.message.create({
    data: {
      threadId: thread.id,
      projectId: params.projectId,
      senderId,
      kind: "system",
      body: params.body,
    },
  });
}
