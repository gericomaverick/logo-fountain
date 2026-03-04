"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { ensureBrowserSupabaseSession } from "@/lib/auth/session";
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

        const result = await ensureBrowserSupabaseSession(supabase);
        if (cancelled) return;

        if (result.status === "signed-in") {
          router.replace(next);
          router.refresh();
          return;
        }

        if (result.status === "missing") {
          setStatus("Sign-in link is missing or invalid. Please request a new one.");
          return;
        }

        console.error("Auth callback failed", result.status === "error" ? result.message : "Unknown auth state");
        setStatus("Sign-in failed. Please request a new link.");
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
