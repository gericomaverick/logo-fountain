"use client";

import Link from "next/link";
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
    <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Admin Health Checks</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm underline">
            Back to queue
          </Link>
          <button type="button" onClick={() => void loadHealth()} className="rounded border border-neutral-300 px-3 py-1 text-sm">
            Re-run checks
          </button>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-neutral-600">Running checks…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {payload ? (
        <>
          <div className="mt-4 rounded border border-neutral-200 p-3 text-sm">
            <p>
              Status:{" "}
              <span className={payload.ok ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
                {payload.ok ? "PASS" : "FAIL"}
              </span>
            </p>
            <p className="mt-1 text-neutral-700">
              {payload.summary.passed}/{payload.summary.total} checks passing ({payload.summary.failed} failing)
            </p>
            <p className="mt-1 text-xs text-neutral-500">Generated: {new Date(payload.generatedAt).toLocaleString()}</p>
          </div>

          <ul className="mt-4 space-y-3">
            {payload.checks.map((check) => (
              <li key={check.key} className="rounded border border-neutral-200 p-4 text-sm">
                <p className="font-medium">
                  {check.passed ? "✅" : "❌"} {check.label}
                </p>
                <p className="mt-1 text-neutral-700">{check.summary}</p>
                <p className="mt-2 text-xs text-neutral-600">Fix guidance:</p>
                <pre className="mt-1 overflow-x-auto rounded bg-neutral-100 p-2 text-xs text-neutral-800">{check.nextStep}</pre>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  );
}
