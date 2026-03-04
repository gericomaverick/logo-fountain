"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { hasValidationErrors, toErrorList, validatePasswordReset, ValidationErrors } from "@/lib/auth/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PasswordErrors = ValidationErrors<"password" | "confirm">;

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<PasswordErrors>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const errors = validatePasswordReset(password, confirm);
    setFieldErrors(errors);

    if (hasValidationErrors(errors)) {
      setStatus("Fix the highlighted fields and try again.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus(`We couldn’t update your password. ${error.message}`);
        return;
      }

      setStatus("Password updated. Redirecting…");
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const summaryErrors = toErrorList(fieldErrors);

  return (
    <AuthShell title="Choose a new password" subtitle="Set a new password for your account.">
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

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label className="mb-1 block text-sm" htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          <label className="mb-1 block text-sm" htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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

        <button type="submit" disabled={busy} className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60">
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>

      {status ? (
        <p className={`mt-4 text-sm ${status.startsWith("Password updated") ? "text-green-700" : "text-red-700"}`} role="status" aria-live="polite">
          {status}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-neutral-600">
        <Link className="underline" href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
