"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { ensureBrowserSupabaseSession } from "@/lib/auth/session";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function safeNextPath(raw: string | null): string {
  if (!raw) return "/dashboard";
  return raw.startsWith("/") ? raw : "/dashboard";
}

function getNextProjectId(nextPath: string): string | null {
  const match = /^\/project\/([^/?#]+)/.exec(nextPath);
  return match?.[1] ?? null;
}

async function hasProjectAccess(projectId: string): Promise<boolean> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
  return res.ok;
}

function redactAuthError(raw: string): string {
  return raw
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .replace(/code=[^&\s]+/gi, "code=[redacted]")
    .replace(/token=[^&\s]+/gi, "token=[redacted]");
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [status, setStatus] = useState("Signing you in...");
  const [recoveryHref, setRecoveryHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const search = new URLSearchParams(window.location.search);
        const next = safeNextPath(search.get("next"));
        const projectId = getNextProjectId(next);
        const loginRecoveryUrl = `/login?next=${encodeURIComponent(next)}`;

        const result = await ensureBrowserSupabaseSession(supabase);
        if (cancelled) return;

        if (result.status !== "signed-in") {
          setRecoveryHref(loginRecoveryUrl);
          setStatus(
            result.status === "missing"
              ? "This sign-in link is missing or expired. Request a fresh magic link to continue."
              : "We couldn’t complete sign-in from this link. Request a fresh magic link to continue."
          );
          if (result.status === "error") {
            console.error("Auth callback failed", redactAuthError(result.message));
          }
          return;
        }

        if (projectId) {
          const allowed = await hasProjectAccess(projectId);
          if (cancelled) return;
          if (!allowed) {
            setRecoveryHref(loginRecoveryUrl);
            setStatus("Signed in, but this account can’t access that project. Request a fresh magic link for the correct account.");
            return;
          }
        }

        router.replace(next);
        router.refresh();
      } catch (error) {
        if (cancelled) return;
        setRecoveryHref("/login");
        const message = error instanceof Error ? redactAuthError(error.message) : "unknown error";
        console.error("Auth callback failed", message);
        setStatus("We couldn’t complete sign-in. Request a fresh magic link and try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <AuthShell title="Signing in" subtitle={status}>
      {recoveryHref ? (
        <div className="text-sm text-neutral-700">
          <Link className="underline" href={recoveryHref}>
            Request a new magic link
          </Link>
        </div>
      ) : (
        <div className="text-sm text-neutral-600">Please wait…</div>
      )}
    </AuthShell>
  );
}
