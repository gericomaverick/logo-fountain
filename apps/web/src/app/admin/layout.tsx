import { ReactNode } from "react";
import { redirect } from "next/navigation";

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

  return <div className="min-h-screen bg-[#faf9f5]">{children}</div>;
}
