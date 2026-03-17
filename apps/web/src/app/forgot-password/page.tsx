"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import resetImage from "@/img/image-panel-4.png";
import { validateEmail } from "@/lib/auth/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

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
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", "/reset-password");

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo.toString(),
      });

      if (error) {
        setStatus(`We couldn’t send the reset email. ${error.message}`);
        return;
      }

      setStatus("Password reset email sent. Check your inbox.");
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
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert" aria-live="assertive">
          <p className="font-medium">⚠ Please fix the highlighted field.</p>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label className="mb-1 block text-sm" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "email-error" : undefined}
            className={`w-full rounded border px-3 py-2 transition focus:outline-none focus:ring-2 ${
              emailError
                ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200"
                : "border-neutral-300 focus:border-neutral-400 focus:ring-black/10"
            }`}
          />
          {emailError ? <p id="email-error" className="mt-2 text-sm font-medium text-red-700" role="alert">{emailError}</p> : null}
        </div>

        <button type="submit" disabled={busy} className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60">
          {busy ? "Sending…" : "Send reset email"}
        </button>
      </form>

      {status ? (
        <p className={`mt-4 text-sm ${status.startsWith("Password reset email sent") ? "text-green-700" : "text-red-700"}`} role="status" aria-live="polite">
          {status}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-neutral-600">
        <Link className="underline" href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
