"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import resetImage from "@/img/image-panel-4.png";
import { validateEmail } from "@/lib/auth/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextEmailError = validateEmail(email);
    setEmailError(nextEmailError);
    setStatus(null);

    if (nextEmailError) return;

    setBusy(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        setStatus("We couldn’t start password recovery. Please try again later.");
        return;
      }

      setStatus("If that account exists, a password recovery email has been sent. Check your inbox.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We’ll email you a link to set a new password."
      sideImageSrc={resetImage}
      sideImageAlt="Soft geometric illustration suggesting account recovery"
      sideTitle="Reset and continue"
      sideDescription="We’ll send a secure link so you can get back into your account quickly."
    >
      {emailError ? (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger" role="alert" aria-live="assertive">
          <p className="font-medium">⚠ Please fix the highlighted field.</p>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "email-error" : undefined}
            className={`portal-field w-full ${
              emailError
                ? "border-danger bg-danger-soft"
                : "border-line"
            }`}
          />
          {emailError ? <p id="email-error" className="mt-2 text-sm font-medium text-danger" role="alert">{emailError}</p> : null}
        </div>

        <button type="submit" disabled={busy} className="portal-btn-primary w-full">
          {busy ? "Sending…" : "Send reset email"}
        </button>
      </form>

      {status ? (
        <p className={`mt-4 text-sm ${status.startsWith("If that account exists") ? "text-success" : "text-danger"}`} role="status" aria-live="polite">
          {status}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-fg-2">
        <Link className="portal-link" href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
