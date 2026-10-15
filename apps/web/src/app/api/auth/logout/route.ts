import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export async function POST(req: Request) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  const supabase = await createSupabaseServerClient();
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return NextResponse.json({ error: { code: "LOGOUT_FAILED", message: "Could not sign out. Please retry." } }, { status: 502 });
  } catch {
    return NextResponse.json({ error: { code: "LOGOUT_FAILED", message: "Could not sign out. Please retry." } }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
