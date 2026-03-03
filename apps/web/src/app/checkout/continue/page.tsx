"use client";

import { useState } from "react";

export default function CheckoutContinuePage() {
  const [sessionId] = useState(() => {
    if (typeof window === "undefined") return "";
    const search = new URLSearchParams(window.location.search);
    return search.get("session_id")?.trim() ?? "";
  });

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
        const message = data?.error?.message || data?.error || "Unable to generate sign-in link.";
        throw new Error(message);
      }

      if (!data?.url) {
        throw new Error("Sign-in link missing.");
      }

      window.location.href = data.url as string;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Finish account setup</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Click continue to securely sign in, then set your password.
      </p>

      <button
        type="button"
        onClick={onContinue}
        disabled={isSubmitting}
        className="mt-6 w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {isSubmitting ? "Generating link..." : "Continue"}
      </button>

      {status ? <p className="mt-4 text-sm text-neutral-700">{status}</p> : null}

      {sessionId ? <p className="mt-6 break-all text-xs text-neutral-500">Session: {sessionId}</p> : null}
    </main>
  );
}
