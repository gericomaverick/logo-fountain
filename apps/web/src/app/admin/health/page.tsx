"use client";

import Link from "next/link";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/ui";
import { useEffect, useState } from "react";

type HealthCheck = {
  key: string;
  label: string;
  passed: boolean;
  summary: string;
  nextStep: string;
};

type HealthPayload = {
  ok: boolean;
  summary: { total: number; passed: number; failed: number };
  checks: HealthCheck[];
  generatedAt: string;
};

type HealthErrorPayload = {
  error?: string | { message?: string };
  message?: string;
};

function readError(payload: HealthErrorPayload | null, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object" && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  if (typeof payload.message === "string") return payload.message;
  return fallback;
}

export default function AdminHealthPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<HealthPayload | null>(null);

  async function loadHealth() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/health", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as HealthPayload | HealthErrorPayload | null;

      if (!response.ok) {
        throw new Error(readError(data as HealthErrorPayload | null, "Failed to run health checks"));
      }

      setPayload(data as HealthPayload);
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : "Failed to run health checks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader
        crumbs={[{ label: "Queue", href: "/admin" }, { label: "Health checks" }]}
        actions={
          <>
            <Link href="/admin" className="portal-btn-ghost">Back to queue</Link>
            <button type="button" onClick={() => void loadHealth()} className="portal-btn-primary">
              Re-run checks
            </button>
          </>
        }
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-10 md:px-8 lg:px-10">
        <header className="pb-5 pt-8">
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Admin Health Checks</h1>
        </header>

        {loading ? <p className="mt-4 text-sm text-fg-2">Running checks…</p> : null}
        {error ? <p className="mt-4 text-sm text-danger" role="alert">{error}</p> : null}

        {payload ? (
          <section className="rounded-xl border border-line bg-panel">
            <div className="rounded-t-xl border-b border-line bg-surface px-4 py-3 text-sm">
              <p>
                Status:{" "}
                <span className={payload.ok ? "font-semibold text-success" : "font-semibold text-danger"}>
                  {payload.ok ? "PASS" : "FAIL"}
                </span>
              </p>
              <p className="mt-1 text-fg-2">
                {payload.summary.passed}/{payload.summary.total} checks passing ({payload.summary.failed} failing)
              </p>
              <p className="mt-1 text-xs text-fg-3">Generated: {new Date(payload.generatedAt).toLocaleString()}</p>
            </div>

            <ul className="divide-y divide-line">
              {payload.checks.map((check) => (
                <li key={check.key} className="p-4 text-base last:rounded-b-xl">
                  <p className="font-medium text-fg">
                    {check.passed ? "✅" : "❌"} {check.label}
                  </p>
                  <p className="mt-1 text-fg-2">{check.summary}</p>
                  <p className="mt-3 text-sm font-medium text-fg-2">Fix guidance:</p>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-3 text-sm text-fg">{check.nextStep}</pre>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </PageShell>
  );
}
