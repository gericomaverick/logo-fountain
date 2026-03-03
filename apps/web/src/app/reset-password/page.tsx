"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setStatus("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus(error.message);
        return;
      }

      setStatus("Password updated. Redirecting…");
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <p className="mt-2 text-sm text-neutral-600">Set a new password for your account.</p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm" htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </div>

        <button type="submit" disabled={busy} className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60">
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>

      {status ? <p className="mt-4 text-sm text-neutral-700">{status}</p> : null}

      <p className="mt-6 text-sm text-neutral-600">
        <Link className="underline" href="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
