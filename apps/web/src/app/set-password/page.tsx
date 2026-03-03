"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function safeNextPath(): string {
  if (typeof window === "undefined") return "/dashboard";
  const rawNext = new URLSearchParams(window.location.search).get("next") || "/dashboard";
  return rawNext.startsWith("/") ? rawNext : "/dashboard";
}

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const nextPath = safeNextPath();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);

    const { data, error } = await supabase.auth.updateUser({ password });

    setIsSubmitting(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    if (!data.user) {
      setStatus("You must be signed in to set a password.");
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Set your password</h1>
      <p className="mt-2 text-sm text-neutral-600">
        For security, you’ll sign in with this password next time.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="confirm">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Save password"}
        </button>
      </form>

      {status ? <p className="mt-4 text-sm text-neutral-700">{status}</p> : null}
    </main>
  );
}
