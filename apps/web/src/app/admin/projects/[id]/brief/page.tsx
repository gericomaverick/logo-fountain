"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";

type Brief = {
  id: string;
  version: number;
  answers: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
};

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "—";
  return JSON.stringify(value, null, 2);
}

export default function AdminProjectBriefPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/brief`, { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { brief?: Brief | null; error?: unknown } | null;
        if (!res.ok) {
          const err = payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null;
          const message =
            typeof err === "string"
              ? err
              : err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string"
                ? (err as { message: string }).message
                : "Failed to load brief";
          throw new Error(message);
        }

        if (!cancelled) {
          setBrief(payload?.brief ?? null);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load brief");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Project brief</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}`}>Back to overview</Link>
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/messages`}>Messages</Link>
          </div>
        </div>

        {loading ? <p className="text-sm text-neutral-600">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !brief ? (
          <div className="portal-subcard">
            <p className="text-sm text-neutral-700">No brief submitted yet.</p>
            <p className="mt-1 text-sm text-neutral-600">Ask the client to submit their brief from their dashboard.</p>
          </div>
        ) : null}

        {brief ? (
          <section className="portal-cardshadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-neutral-900">Version {brief.version}</p>
              <p className="text-xs text-neutral-500">Submitted {new Date(brief.createdAt).toLocaleString()}</p>
            </div>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {Object.entries(brief.answers ?? {}).map(([key, value]) => (
                <div key={key} className="portal-subcard">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{key}</dt>
                  <dd className="mt-2 whitespace-pre-wrap text-sm text-neutral-900">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </main>
    </>
  );
}
