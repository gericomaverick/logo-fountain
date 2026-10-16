"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import resetImage from "@/img/image-panel-4.png";
import { hasValidationErrors, toErrorList, validatePasswordReset, ValidationErrors } from "@/lib/auth/validation";
import { postAuth, takeMailboxProof } from "@/lib/auth/client";

type PasswordErrors = ValidationErrors<"password" | "confirm">;

export default function ResetPasswordPage() {
  const router = useRouter();
  const proof = useRef<{ token: string; next: string | null } | null>(null);
  useEffect(() => { proof.current ??= takeMailboxProof(); }, []);

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
      const { error } = await postAuth("reset-password", { token: proof.current?.token, newPassword: password });
      if (error) {
        setStatus(`We couldn’t update your password. ${error}`);
        return;
      }

      setStatus("Password updated. Redirecting…");
      router.replace("/login?password=updated");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const summaryErrors = toErrorList(fieldErrors);

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Set a new password for your account."
      sideImageSrc={resetImage}
      sideImageAlt="Abstract security-inspired gradient illustration"
      sideTitle="Create a strong new password"
      sideDescription="Use at least 8 characters and avoid reusing old passwords."
    >
      {summaryErrors.length > 0 ? (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger" role="alert" aria-live="assertive">
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
          <label className="mb-1 block text-sm font-medium text-fg" htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            className={`portal-field w-full ${
              fieldErrors.password
                ? "border-danger bg-danger-soft"
                : "border-line"
            }`}
          />
          {fieldErrors.password ? <p id="password-error" className="mt-2 text-sm font-medium text-danger" role="alert">{fieldErrors.password}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-fg" htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(fieldErrors.confirm)}
            aria-describedby={fieldErrors.confirm ? "confirm-error" : undefined}
            className={`portal-field w-full ${
              fieldErrors.confirm
                ? "border-danger bg-danger-soft"
                : "border-line"
            }`}
          />
          {fieldErrors.confirm ? <p id="confirm-error" className="mt-2 text-sm font-medium text-danger" role="alert">{fieldErrors.confirm}</p> : null}
        </div>

        <button type="submit" disabled={busy} className="portal-btn-primary w-full">
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>

      {status ? (
        <p className={`mt-4 text-sm ${status.startsWith("Password updated") ? "text-success" : "text-danger"}`} role="status" aria-live="polite">
          {status}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-fg-2">
        <Link className="portal-link" href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
