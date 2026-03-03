"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const nextPath = (() => {
    if (typeof window === "undefined") return "/dashboard";
    const rawNext = new URLSearchParams(window.location.search).get("next") || "/dashboard";
    return rawNext.startsWith("/") ? rawNext : "/dashboard";
  })();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return null;

    const params = new URLSearchParams(hash.slice(1));
    const description = params.get("error_description");
    const code = params.get("error_code");

    if (!description) return null;

    const message = code ? `${description} (${code})` : description;
    return message.replace(/\+/g, " ");
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onPasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  async function onMagicLinkRequest() {
    if (!email) {
      setStatus("Enter your email first.");
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", nextPath);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    setIsSubmitting(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Magic link sent. Check your inbox.");
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      <form className="mt-6 space-y-4" onSubmit={onPasswordSignIn}>
        <div>
          <label className="mb-1 block text-sm" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={onMagicLinkRequest}
        disabled={isSubmitting}
        className="mt-3 w-full rounded border border-neutral-300 px-4 py-2 disabled:opacity-60"
      >
        Send magic link
      </button>

      {status ? <p className="mt-4 text-sm text-neutral-700">{status}</p> : null}
    </main>
  );
}
