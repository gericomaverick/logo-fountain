"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VerifyOtpParams } from "@supabase/supabase-js";

import { AuthShell } from "@/components/auth-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function safeNextPath(raw: string | null): string {
  if (!raw) return "/dashboard";
  return raw.startsWith("/") ? raw : "/dashboard";
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [status, setStatus] = useState("Signing you in...");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const search = new URLSearchParams(window.location.search);
        const next = safeNextPath(search.get("next"));
        const code = search.get("code");
        const tokenHash = search.get("token_hash") ?? search.get("token");
        const otpType = search.get("type");
        const email = search.get("email");

        // 1) Magic-link OTP (token hash + email in query string)
        if (tokenHash && otpType && email) {
          const { error } = await supabase.auth.verifyOtp({
            type: otpType as VerifyOtpParams["type"],
            token_hash: tokenHash,
            email,
          });
          if (error) throw error;
          if (cancelled) return;
          router.replace(next);
          router.refresh();
          return;
        }

        // 2) PKCE flow (code in query string)
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (cancelled) return;
          router.replace(next);
          router.refresh();
          return;
        }

        // 3) Implicit flow (tokens in URL hash)
        const hash = window.location.hash;
        if (hash && hash.length > 1) {
          const params = new URLSearchParams(hash.slice(1));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;

            // Clear hash
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

            if (cancelled) return;
            router.replace(next);
            router.refresh();
            return;
          }
        }

        setStatus("Sign-in link is missing or invalid. Please request a new one.");
      } catch (error) {
        console.error("Auth callback failed", error);
        setStatus("Sign-in failed. Please request a new link.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <AuthShell title="Signing in" subtitle={status}>
      <div className="text-sm text-neutral-600">Please wait…</div>
    </AuthShell>
  );
}
