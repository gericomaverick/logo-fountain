"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { validatePasswordReset, type ValidationErrors } from "@/lib/auth/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SessionPayload = {
  authenticated: boolean;
  isAdmin?: boolean;
};

type ProfilePayload = {
  profile: {
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
};

type PasswordErrors = ValidationErrors<"password" | "confirm">;

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload>({ authenticated: false });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) {
          setError(res.status === 401 ? "Please sign in to access settings." : "Failed to load settings.");
          return;
        }

        const payload = (await res.json()) as ProfilePayload;
        const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
        const sessionPayload = (await sessionRes.json().catch(() => null)) as SessionPayload | null;
        if (cancelled) return;

        setEmail(payload.profile.email);
        setFirstName(payload.profile.firstName ?? "");
        setLastName(payload.profile.lastName ?? "");
        setSession(sessionPayload ?? { authenticated: false });
      } catch {
        if (!cancelled) setError("Failed to load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(null);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });

      if (!res.ok) {
        setError("Failed to save settings.");
        return;
      }

      setSaved("Saved");
    } catch {
      setError("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function onPasswordSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordStatus(null);

    const nextErrors = validatePasswordReset(password, confirmPassword);
    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPasswordSaving(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setPasswordStatus(`We couldn’t update your password. ${updateError.message}`);
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setPasswordErrors({});
      setPasswordStatus("Password updated. Use it the next time you sign in.");
    } catch {
      setPasswordStatus("We couldn’t update your password. Please try again.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
          <p className="mt-2 text-sm text-neutral-600">Update your profile details and sign-in password.</p>
        </header>

        {loading ? <p className="mt-4 text-sm text-neutral-500">Loading…</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {!loading && !error ? (
          <div className="mt-3 space-y-5">
            <section className="portal-card">
              <form className="space-y-4" onSubmit={(e) => void onSave(e)}>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Email</span>
                  <input className="portal-field bg-neutral-100" type="email" value={email ?? ""} disabled />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium">First name</span>
                  <input
                    className="portal-field"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={80}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Last name</span>
                  <input
                    className="portal-field"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={80}
                  />
                </label>

                <p className="text-xs text-neutral-500">Billing email and VAT number will be added here in a later update.</p>
                {!session.isAdmin ? (
                  <p className="text-xs text-neutral-500">
                    Need a copy of a paid invoice? Visit{" "}
                    <Link className="portal-link" href="/settings/invoices">
                      Invoices
                    </Link>
                    .
                  </p>
                ) : null}

                <button type="submit" disabled={saving} className="portal-btn-secondary">
                  {saving ? "Saving…" : "Save changes"}
                </button>

                {saved ? <p className="text-sm text-green-700">{saved}</p> : null}
              </form>
            </section>

            <section className="portal-card">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-neutral-900">Password</h2>
                <p className="mt-1 text-sm text-neutral-600">Change the password used to sign in to this account.</p>
              </div>

              <form className="space-y-4" onSubmit={(e) => void onPasswordSave(e)}>
                <label className="block text-sm" htmlFor="new-password">
                  <span className="mb-1 block font-medium">New password</span>
                  <input
                    id="new-password"
                    className={passwordErrors.password ? "portal-field border-red-400" : "portal-field"}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={Boolean(passwordErrors.password)}
                    aria-describedby={passwordErrors.password ? "new-password-error" : undefined}
                  />
                </label>
                {passwordErrors.password ? (
                  <p id="new-password-error" className="text-sm font-medium text-red-700" role="alert">
                    {passwordErrors.password}
                  </p>
                ) : null}

                <label className="block text-sm" htmlFor="confirm-password">
                  <span className="mb-1 block font-medium">Confirm new password</span>
                  <input
                    id="confirm-password"
                    className={passwordErrors.confirm ? "portal-field border-red-400" : "portal-field"}
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-invalid={Boolean(passwordErrors.confirm)}
                    aria-describedby={passwordErrors.confirm ? "confirm-password-error" : undefined}
                  />
                </label>
                {passwordErrors.confirm ? (
                  <p id="confirm-password-error" className="text-sm font-medium text-red-700" role="alert">
                    {passwordErrors.confirm}
                  </p>
                ) : null}

                <button type="submit" disabled={passwordSaving} className="portal-btn-secondary">
                  {passwordSaving ? "Updating…" : "Update password"}
                </button>

                {passwordStatus ? (
                  <p
                    className={
                      passwordStatus.startsWith("Password updated") ? "text-sm text-green-700" : "text-sm text-red-600"
                    }
                  >
                    {passwordStatus}
                  </p>
                ) : null}
              </form>
            </section>
          </div>
        ) : null}
      </main>
    </PageShell>
  );
}
