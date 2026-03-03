import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNextPath(raw: string | null): string {
  if (!raw) return "/dashboard";
  // Only allow internal relative redirects.
  return raw.startsWith("/") ? raw : "/dashboard";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNextPath(url.searchParams.get("next"));

  const supabase = await createSupabaseServerClient();

  // Supabase may return either a PKCE `code` or a `token_hash` depending on link type/config.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, url.origin));
    }

    return NextResponse.redirect(new URL(next, url.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "recovery" | "invite" | "email_change",
      token_hash: tokenHash,
    });

    if (error) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, url.origin));
    }

    return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, url.origin));
}
