"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type CheckoutStatusResponse = {
  fulfilled: boolean;
  projectId?: string | null;
};

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 45000;

async function isAuthenticated() {
  try {
    const res = await fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "include",
    });

    if (!res.ok) return false;

    const body = (await res.json()) as { authenticated?: boolean };
    return Boolean(body.authenticated);
  } catch {
    return false;
  }
}

export default function SuccessProcessingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTimedOut, setIsTimedOut] = useState(false);

  const statusUrl = useMemo(() => {
    if (!sessionId) return null;
    return `/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`;
  }, [sessionId]);

  useEffect(() => {
    if (!statusUrl) {
      setErrorMessage("Missing checkout session. Please return to pricing and try again.");
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;

      if (Date.now() - startedAt >= TIMEOUT_MS) {
        setIsTimedOut(true);
        return;
      }

      try {
        const res = await fetch(statusUrl, { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Unable to check payment status.");
        }

        const data = (await res.json()) as CheckoutStatusResponse;

        if (data.fulfilled) {
          const authed = await isAuthenticated();
          const destination = authed ? "/dashboard" : "/login";
          const params = new URLSearchParams();

          if (data.projectId) {
            params.set("projectId", data.projectId);
          }

          const nextUrl = params.toString() ? `${destination}?${params.toString()}` : destination;
          router.replace(nextUrl);
          return;
        }

        window.setTimeout(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [router, statusUrl]);

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Processing…</h1>
      <p className="mt-2 text-sm text-neutral-600">
        We&apos;re confirming your payment and setting up your project.
      </p>

      {sessionId ? <p className="mt-4 text-xs text-neutral-500">Session: {sessionId}</p> : null}

      {isTimedOut ? (
        <p className="mt-4 text-sm text-red-600">
          This is taking longer than expected. Please refresh this page in a moment.
        </p>
      ) : null}

      {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
    </main>
  );
}
