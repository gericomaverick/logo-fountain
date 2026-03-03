"use client";

import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";

type ProfilePayload = {
  profile: {
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState<string | null>(null);

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
        if (cancelled) return;

        setEmail(payload.profile.email);
        setFirstName(payload.profile.firstName ?? "");
        setLastName(payload.profile.lastName ?? "");
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

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
          <p className="mt-2 text-sm text-neutral-600">Update your profile details.</p>
        </header>

        {loading ? <p className="mt-4 text-sm text-neutral-500">Loading…</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {!loading && !error ? (
          <section className="mt-3 rounded-2xl border border-neutral-200 bg-white p-6 ">
            <form className="space-y-4" onSubmit={(e) => void onSave(e)}>
              <label className="block text-sm">
              <span className="mb-1 block font-medium">Email</span>
              <input
                className="w-full rounded border border-neutral-300 bg-neutral-100 px-3 py-2"
                type="email"
                value={email ?? ""}
                disabled
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">First name</span>
              <input
                className="w-full rounded border border-neutral-300 px-3 py-2"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={80}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Last name</span>
              <input
                className="w-full rounded border border-neutral-300 px-3 py-2"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={80}
              />
            </label>

            <p className="text-xs text-neutral-500">Billing email and VAT number will be added here in a later update.</p>

            <button
              type="submit"
              disabled={saving}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>

            {saved ? <p className="text-sm text-green-700">{saved}</p> : null}
            </form>
          </section>
        ) : null}
      </main>
    </PageShell>
  );
}
