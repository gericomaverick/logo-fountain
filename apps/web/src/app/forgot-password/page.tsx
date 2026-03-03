"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);

    try {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", "/reset-password");

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo.toString(),
      });

      if (error) {
        setStatus(error.message);
        return;
      }

      setStatus("Password reset email sent. Check your inbox.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a link to set a new password.">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </div>

        <button type="submit" disabled={busy} className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60">
          {busy ? "Sending…" : "Send reset email"}
        </button>
      </form>

      {status ? <p className="mt-4 text-sm text-neutral-700">{status}</p> : null}

      <p className="mt-6 text-sm text-neutral-600">
        <Link className="underline" href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
