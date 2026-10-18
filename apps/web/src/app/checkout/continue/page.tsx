"use client";

import { PageHeader } from "@/components/ui";

import Link from "next/link";
import { useState } from "react";

export default function CheckoutContinuePage() {
  const [sessionInfo] = useState(() => {
    if (typeof window === "undefined") return { sessionId: "" };
    const search = new URLSearchParams(window.location.search);
    return { sessionId: search.get("session_id")?.trim() ?? "" };
  });
  const sessionId = sessionInfo.sessionId;

  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onContinue() {
    if (!sessionId) {
      setStatus("Missing session id.");
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const res = await fetch("/api/checkout/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json() : null;

      if (!res.ok) {
        const message = data?.error?.message || data?.error || "Unable to send sign-in email.";
        throw new Error(message);
      }

      setStatus("Sign-in link sent. Check the purchaser email inbox to continue.");
      setIsSubmitting(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-app text-fg">
      <PageHeader crumbs={[{ label: "Checkout" }]} />
      <main className="px-4 py-6 md:px-8 lg:py-8">
        <div className="mx-auto max-w-[920px]">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Sign in to your account</h1>
          <p className="mt-2 text-base text-fg-2">
            We’ll email the purchaser a secure sign-in link to open the latest project.
          </p>

          <button
            type="button"
            onClick={onContinue}
            disabled={isSubmitting}
            className="portal-btn-primary mt-6"
          >
            {isSubmitting ? "Sending email..." : "Email me a sign-in link"}
          </button>

          {status ? <p className="mt-4 text-sm text-fg-2">{status}</p> : null}

          <p className="mt-4 text-sm text-fg-2">
            First purchase and need to create or recover a password? Use the normal{" "}
            <Link className="portal-link" href="/forgot-password">password recovery flow</Link> after verifying your mailbox.
            A checkout session link cannot set or reset a password.
          </p>

          {sessionId ? <p className="mt-6 break-all text-xs text-fg-3">Session: {sessionId}</p> : null}
        </div>
      </main>
    </div>
  );
}
