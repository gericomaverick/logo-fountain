"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import loginImage from "@/img/image-panel-1.png";
import { postAuth } from "@/lib/auth/client";
import { safeAuthNextPath } from "@/lib/auth/safe-next";
import { hasValidationErrors, toErrorList, validateEmail, validateLogin, ValidationErrors } from "@/lib/auth/validation";

type LoginErrors = ValidationErrors<"email" | "password">;

export default function LoginPage() {
  const router = useRouter();

  const nextPath = (() => {
    if (typeof window === "undefined") return "/dashboard";
    return safeAuthNextPath(new URLSearchParams(window.location.search).get("next"));
  })();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginErrors>({});
  const [status, setStatus] = useState<string | null>(null);
  // Which way the status line reads, rather than matching on its text.
  const [statusTone, setStatusTone] = useState<"success" | "error">("error");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Note: magic-link callbacks are handled at /auth/callback.

  async function onPasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateLogin(email, password);
    setFieldErrors(errors);
    setStatus(null);

    if (hasValidationErrors(errors)) return;

    setIsSubmitting(true);

    const { error } = await postAuth("login", { email, password });

    setIsSubmitting(false);

    if (error) {
      setStatusTone("error");
      setStatus(`We couldn’t sign you in. ${error}`);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  async function onMagicLinkRequest() {
    const emailError = validateEmail(email);
    const nextErrors: LoginErrors = emailError ? { email: emailError } : {};
    setFieldErrors(nextErrors);

    if (emailError) {
      setStatusTone("error");
      setStatus("Fix the highlighted field and try again.");
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    const { error } = await postAuth("magic-link", { email, next: nextPath });

    setIsSubmitting(false);

    if (error) {
      setStatusTone("error");
      setStatus(`We couldn’t send the magic link. ${error}`);
      return;
    }

    setStatusTone("success");
    setStatus("If that account exists, a magic link has been sent. Check your inbox.");
  }

  const summaryErrors = toErrorList(fieldErrors);

  return (
    <AuthShell
      title="Sign in"
      subtitle="Sign in with your password, or request a magic link."
      sideImageSrc={loginImage}
      sideImageAlt="Abstract wave artwork in warm gradient tones"
      sideTitle="Welcome back"
      sideDescription="Pick up where you left off and keep your project momentum going."
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

      <form className="space-y-4" onSubmit={onPasswordSignIn} noValidate>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            className={`portal-field w-full ${
              fieldErrors.email
                ? "border-danger bg-danger-soft"
                : "border-line"
            }`}
          />
          {fieldErrors.email ? (
            <p id="email-error" className="mt-2 text-sm font-medium text-danger" role="alert">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-fg" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            className={`portal-field w-full ${
              fieldErrors.password
                ? "border-danger bg-danger-soft"
                : "border-line"
            }`}
          />
          {fieldErrors.password ? (
            <p id="password-error" className="mt-2 text-sm font-medium text-danger" role="alert">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={isSubmitting} className="portal-btn-primary w-full">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={onMagicLinkRequest}
        disabled={isSubmitting}
        className="portal-btn-secondary mt-3 w-full"
      >
        Send magic link
      </button>

      <p className="mt-6 text-sm text-fg-2">
        <a className="portal-link" href="/forgot-password">Forgot password?</a>
      </p>

      {status ? (
        <p className={`mt-4 text-sm ${statusTone === "success" ? "text-success" : "text-danger"}`} role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </AuthShell>
  );
}
