"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type CheckoutStatusResponse = {
  fulfilled: boolean;
  projectId?: string | null;
};

const FAST_POLL_INTERVAL_MS = 2000;
const SLOW_POLL_INTERVAL_MS = 10000;
const TROUBLESHOOTING_TIMEOUT_MS = 45000;

type ResendState = "idle" | "sending" | "sent" | "error";

export default function SuccessProcessingClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [isFulfilled, setIsFulfilled] = useState(false);
  const [fulfilledProjectId, setFulfilledProjectId] = useState<string | null>(null);
  const [resendState, setResendState] = useState<ResendState>("idle");
  const [resendMessage, setResendMessage] = useState<string | null>(null);

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

      const elapsed = Date.now() - startedAt;
      const timedOut = elapsed >= TROUBLESHOOTING_TIMEOUT_MS;

      if (timedOut) setShowTroubleshooting(true);

      try {
        const res = await fetch(statusUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to check payment status.");

        const data = (await res.json()) as CheckoutStatusResponse;

        if (data.fulfilled) {
          setIsFulfilled(true);
          setFulfilledProjectId(data.projectId ?? null);
          setErrorMessage(null);
          return;
        }

        window.setTimeout(
          () => {
            void poll();
          },
          timedOut ? SLOW_POLL_INTERVAL_MS : FAST_POLL_INTERVAL_MS
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [retryNonce, statusUrl]);

  async function onResendEmail() {
    if (!sessionId) return;

    setResendState("sending");
    setResendMessage(null);

    try {
      const res = await fetch("/api/checkout/resend-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const body = (await res.json()) as {
        error?: { message?: string };
        skipped?: boolean;
        reason?: string;
      };

      if (!res.ok) {
        setResendState("error");
        setResendMessage(body.error?.message || "Could not resend email. Please try again.");
        return;
      }

      setResendState("sent");
      setResendMessage(
        body.skipped
          ? body.reason || "Email sending is currently not configured."
          : "Sign-in link sent. Check your inbox."
      );
    } catch {
      setResendState("error");
      setResendMessage("Could not resend email. Please try again.");
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      {!isFulfilled ? (
        <>
          <h1 className="text-2xl font-semibold">Processing…</h1>
          <p className="mt-2 text-sm text-neutral-600">
            We&apos;re confirming your payment and setting up your project.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Check your email for your sign-in link</h1>
          <p className="mt-2 text-sm text-neutral-600">
            We sent a secure sign-in link. After opening it, you&apos;ll set your password and land in your dashboard.
          </p>
          <button
            type="button"
            onClick={() => void onResendEmail()}
            disabled={resendState === "sending"}
            className="mt-4 rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-60"
          >
            {resendState === "sending" ? "Resending..." : "Resend email"}
          </button>
          {resendMessage ? <p className="mt-3 text-sm text-neutral-700">{resendMessage}</p> : null}
        </>
      )}

      {sessionId ? <p className="mt-4 text-xs text-neutral-500">Session: {sessionId}</p> : null}

      {showTroubleshooting && !fulfilledProjectId ? (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Still waiting for confirmation</p>
          <p className="mt-2 text-sm text-amber-800">
            Your payment may have completed, but the webhook update has not arrived yet.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
            <li>Ensure <code>stripe listen</code> forwarding is running (local/dev).</li>
            <li>Confirm your Stripe webhook secret is correct in environment variables.</li>
            <li>Check your app server is running and reachable.</li>
            <li>Wait a moment, then retry status check.</li>
          </ul>
          <button
            type="button"
            className="mt-4 rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
            onClick={() => {
              setErrorMessage(null);
              setRetryNonce((value) => value + 1);
            }}
          >
            Retry now
          </button>
        </div>
      ) : null}

      {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
    </main>
  );
}
