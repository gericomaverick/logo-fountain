import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { isAdminUser } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function verificationUnavailable() {
  return NextResponse.json(
    { error: { code: "SESSION_VERIFICATION_UNAVAILABLE", message: "Could not verify session. Please retry." } },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    // Supabase documents AuthSessionMissingError for an absent session/access
    // token. Do not infer absence from other errors, status codes, messages,
    // or a missing user: provider/network failure is not verified sign-out.
    if (error) {
      if (isAuthSessionMissingError(error) && !data?.user) {
        return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
      }
      return verificationUnavailable();
    }
    if (!data?.user) return verificationUnavailable();

    const user = data.user;
    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email ?? undefined,
      isAdmin: await isAdminUser(user),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Do not expose provider diagnostics or turn unexpected verification
    // failures into an unauthenticated result (including during logout).
    return verificationUnavailable();
  }
}
