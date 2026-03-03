import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { isAdminUser } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdminUser(user))) {
    redirect(`/login?next=${encodeURIComponent("/admin")}`);
  }

  return <PageShell>{children}</PageShell>;
}
