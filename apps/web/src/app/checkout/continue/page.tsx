"use client";

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
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Sign in to your account</h1>
      <p className="mt-2 text-sm text-neutral-600">
        We’ll email the purchaser a secure sign-in link to open the latest project.
      </p>

      <button
        type="button"
        onClick={onContinue}
        disabled={isSubmitting}
        className="mt-6 w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {isSubmitting ? "Sending email..." : "Email me a sign-in link"}
      </button>

      {status ? <p className="mt-4 text-sm text-neutral-700">{status}</p> : null}

      <p className="mt-4 text-sm text-neutral-600">
        First purchase and need to create or recover a password? Use the normal{" "}
        <Link className="underline" href="/forgot-password">password recovery flow</Link> after verifying your mailbox.
        A checkout session link cannot set or reset a password.
      </p>

      {sessionId ? <p className="mt-6 break-all text-xs text-neutral-500">Session: {sessionId}</p> : null}
    </main>
  );
}
