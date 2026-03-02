import type { User } from "@supabase/supabase-js";

import { prisma } from "@/lib/prisma";

function getAdminEmailAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";

  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function isAdminUser(user: User): Promise<boolean> {
  const email = user.email?.toLowerCase();
  const allowlist = getAdminEmailAllowlist();

  if (email && allowlist.has(email)) return true;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { isAdmin: true },
  });

  return Boolean(profile?.isAdmin);
}
