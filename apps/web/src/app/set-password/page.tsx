"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { ensureBrowserSupabaseSession } from "@/lib/auth/session";
import { hasValidationErrors, toErrorList, validatePasswordReset, ValidationErrors } from "@/lib/auth/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PasswordErrors = ValidationErrors<"password" | "confirm">;

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
  const [fieldErrors, setFieldErrors] = useState<PasswordErrors>({});
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authState, setAuthState] = useState<"checking" | "ready" | "error">("checking");
  const isSessionReady = authState === "ready";

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await ensureBrowserSupabaseSession(supabase);
      if (cancelled) return;

      if (result.status === "signed-in") {
        setAuthState("ready");
        setStatus(null);
        return;
      }

      setAuthState("error");
      if (result.status === "missing") {
        setStatus("Your sign-in link is missing or expired. Request a new one to continue.");
      } else {
        setStatus(`We couldn’t sign you in automatically. ${result.message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const errors = validatePasswordReset(password, confirm);
    setFieldErrors(errors);

    if (hasValidationErrors(errors)) {
      setStatus("Fix the highlighted fields and try again.");
      return;
    }

    if (!isSessionReady) {
      setStatus(authState === "checking" ? "Hold on while we verify your sign-in link." : "You need to sign in before setting a password.");
      return;
    }

    setIsSubmitting(true);

    const { data, error } = await supabase.auth.updateUser({ password });

    setIsSubmitting(false);

    if (error) {
      setStatus(`We couldn’t save your password. ${error.message}`);
      return;
    }

    if (!data.user) {
      setStatus("You need to sign in before setting a password.");
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  const summaryErrors = toErrorList(fieldErrors);

  return (
    <AuthShell
      title="Set your password"
      subtitle="For security, you’ll sign in with this password next time."
      sideImageSrc="/img/auth/auth-set-password.svg"
      sideImageAlt="Gradient illustration representing account setup"
      sideTitle="One last step"
      sideDescription="Set your password now and future sign-ins will be faster."
    >
      {summaryErrors.length > 0 ? (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert" aria-live="assertive">
          <p className="font-medium">⚠ Please fix the highlighted fields:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {summaryErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {authState === "checking" ? (
        <p className="mb-4 text-sm text-neutral-600" aria-live="polite">Hang tight — we’re verifying your sign-in link…</p>
      ) : null}

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
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
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            className={`w-full rounded border px-3 py-2 transition focus:outline-none focus:ring-2 ${
              fieldErrors.password
                ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200"
                : "border-neutral-300 focus:border-neutral-400 focus:ring-black/10"
            }`}
          />
          {fieldErrors.password ? <p id="password-error" className="mt-2 text-sm font-medium text-red-700" role="alert">{fieldErrors.password}</p> : null}
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
            aria-invalid={Boolean(fieldErrors.confirm)}
            aria-describedby={fieldErrors.confirm ? "confirm-error" : undefined}
            className={`w-full rounded border px-3 py-2 transition focus:outline-none focus:ring-2 ${
              fieldErrors.confirm
                ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200"
                : "border-neutral-300 focus:border-neutral-400 focus:ring-black/10"
            }`}
          />
          {fieldErrors.confirm ? <p id="confirm-error" className="mt-2 text-sm font-medium text-red-700" role="alert">{fieldErrors.confirm}</p> : null}
        </div>

        <button
          type="submit"
          disabled={!isSessionReady || isSubmitting}
          className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Save password"}
        </button>
      </form>

      {status ? <p className="mt-4 text-sm text-red-700" role="status" aria-live="polite">{status}</p> : null}
    </AuthShell>
  );
}
