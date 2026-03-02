import { NextResponse } from "next/server";

import { isAdminUser } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    userId: session.user.id,
    email: session.user.email ?? undefined,
    isAdmin: await isAdminUser(session.user),
  });
}
