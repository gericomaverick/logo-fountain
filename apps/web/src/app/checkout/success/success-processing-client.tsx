"use client";

import { PageHeader } from "@/components/ui";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { shouldShowCheckoutTroubleshooting } from "@/lib/checkout-success";

type CheckoutStatusResponse = {
  fulfilled: boolean;
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
    <div className="min-h-screen bg-app text-fg">
      <PageHeader crumbs={[{ label: "Checkout" }]} />
      <main className="px-4 py-6 md:px-8 lg:py-8">
        <div className="mx-auto max-w-[720px]">
          {!isFulfilled ? (
            <>
              <h1 className="text-3xl font-semibold tracking-tight text-fg">Processing…</h1>
              <p className="mt-2 text-base text-fg-2">
                We&apos;re confirming your payment and setting up your project.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-semibold tracking-tight text-fg">Check your email for your sign-in link</h1>
              <p className="mt-2 text-base text-fg-2">
                We sent a secure sign-in link to the purchaser email. Open it to finish setup or sign in to your dashboard.
              </p>
              <p className="mt-2 text-base text-fg-2">
                If the original first-time setup email expired, sign in through the mailbox link and use the normal{" "}
                <Link className="portal-link" href="/forgot-password">password recovery flow</Link>. A checkout session ID cannot reset a password.
              </p>
              <button
                type="button"
                onClick={() => void onResendEmail()}
                disabled={resendState === "sending"}
                className="portal-btn-primary mt-4"
              >
                {resendState === "sending" ? "Resending..." : "Resend email"}
              </button>
              {resendMessage ? <p className="mt-3 text-sm text-fg-2">{resendMessage}</p> : null}
            </>
          )}

          {sessionId ? <p className="mt-4 break-all text-xs text-fg-3">Session: {sessionId}</p> : null}

          {shouldShowCheckoutTroubleshooting(showTroubleshooting, isFulfilled) ? (
            <div className="mt-6 rounded-lg border border-warning/30 bg-warning-soft p-4">
              <p className="text-base font-medium text-fg">Still waiting for confirmation</p>
              <p className="mt-2 text-sm text-fg-2">
                Your payment may have completed, but the webhook update has not arrived yet.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg-2">
                <li>Ensure <code>stripe listen</code> forwarding is running (local/dev).</li>
                <li>Confirm your Stripe webhook secret is correct in environment variables.</li>
                <li>Check your app server is running and reachable.</li>
                <li>Wait a moment, then retry status check.</li>
              </ul>
              <button
                type="button"
                className="portal-btn-primary mt-4"
                onClick={() => {
                  setErrorMessage(null);
                  setRetryNonce((value) => value + 1);
                }}
              >
                Retry now
              </button>
            </div>
          ) : null}

          {errorMessage ? <p role="alert" className="mt-4 text-sm text-danger">{errorMessage}</p> : null}
        </div>
      </main>
    </div>
  );
}
