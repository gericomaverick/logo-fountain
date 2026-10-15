import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export async function POST(req: Request) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
