import type { User } from "./current-user";
import { prisma } from "@/lib/prisma";
export async function isAdminUser(user: User): Promise<boolean> {
  if (!user.emailVerified) return false;
  const profile = await prisma.profile.findUnique({ where: { id: user.id }, select: { isAdmin: true } });
  return Boolean(profile?.isAdmin);
}
