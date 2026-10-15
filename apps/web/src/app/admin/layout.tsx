import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { isAdminUser } from "@/lib/auth/admin";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user || !(await isAdminUser(user))) {
    redirect(`/login?next=${encodeURIComponent("/admin")}`);
  }

  return <PageShell>{children}</PageShell>;
}
