"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SessionPayload = {
  authenticated: boolean;
  email?: string;
  isAdmin?: boolean;
};

export function HeaderNav() {
  const router = useRouter();
  const [session, setSession] = useState<SessionPayload>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as SessionPayload | null;

        if (!cancelled) {
          setSession(payload ?? { authenticated: false });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <nav className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-3 px-6 py-3 text-sm md:px-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-semibold">Logo Fountain</Link>
          <Link className="underline" href="/dashboard">Dashboard</Link>
          {session.authenticated ? <Link className="underline" href="/settings">Settings</Link> : null}

          {!session.authenticated ? <Link className="underline" href="/pricing">Pricing</Link> : null}
        </div>

        <div className="flex items-center gap-3">
          {session.authenticated ? (
            <>
              <span className="text-neutral-600">{session.email ?? "Signed in"}</span>
              <button
                type="button"
                className="rounded border border-neutral-300 px-2 py-1"
                disabled={loggingOut}
                onClick={() => {
                  void logout();
                }}
              >
                {loggingOut ? "Logging out…" : "Logout"}
              </button>
            </>
          ) : loading ? (
            <span className="text-neutral-500">Loading…</span>
          ) : (
            <Link className="underline" href="/login">Login</Link>
          )}
        </div>
      </nav>
    </header>
  );
}
