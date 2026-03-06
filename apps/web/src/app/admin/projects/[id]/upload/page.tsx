"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { Card, PageShell } from "@/components/page-shell";

type Snapshot = {
  status: string;
  concepts: Array<{ id: string; number: number; status: string; notes: string | null }>;
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

export default function AdminProjectUploadPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function refresh(id: string) {
    const response = await fetch(`/api/admin/projects/${id}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readError(payload, "Failed to load project"));
    setSnapshot(payload?.snapshot ?? null);
  }

  useEffect(() => {
    if (!projectId) return;

    const load = async () => {
      try {
        await refresh(projectId);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [projectId]);

  async function uploadConcept(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !file) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    const data = new FormData();
    data.set("file", file);
    data.set("notes", notes);

    const response = await fetch(`/api/admin/projects/${projectId}/concepts`, {
      method: "POST",
      body: data,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(readError(payload, "Upload failed"));
    } else {
      const uploadedNumber = Number(payload?.concept?.number);
      const label = Number.isFinite(uploadedNumber) && uploadedNumber > 0 ? `Concept #${uploadedNumber}` : "Concept";
      setSuccess(`${label} uploaded and published.`);
      setFile(null);
      await refresh(projectId);
    }

    setBusy(false);
  }

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Upload concepts</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}`}>Project overview</Link>
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/concepts`}>Concepts manager</Link>
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/messages`}>Project messages</Link>
          </div>
        </div>

        <Card className="mt-0">
          <h2 className="text-lg font-medium">Upload and publish concept</h2>
          <p className="mt-1 text-sm text-neutral-600">Uploading here publishes immediately so the client can review it.</p>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-green-700">{success}</p> : null}

          <form className="mt-4" onSubmit={uploadConcept}>
            <p className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
              Concept uploads auto-assign the next concept number so new uploads cannot overwrite Concept #1 by mistake.
            </p>

            <label className="mt-4 block text-sm font-medium">Asset file</label>
            <input className="mt-1 block" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

            <label className="mt-4 block text-sm font-medium">Description / explainer</label>
            <p className="mt-1 text-xs text-neutral-600">Shown to the client on the concept page. You can use multiple lines.</p>
            <textarea
              className="mt-2 w-full rounded border border-neutral-300 px-2 py-1"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Why this direction, what to look for, and any rationale"
            />

            <button className="mt-4 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={busy || !file}>
              {busy ? "Uploading…" : "Upload concept"}
            </button>
          </form>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Existing concepts</h2>
            <Link className="text-sm underline" href={`/admin/projects/${projectId}/concepts`}>Open concepts manager + feedback inbox</Link>
          </div>
          {loading ? <p className="mt-3 text-sm text-neutral-600">Loading…</p> : null}
          <ul className="mt-3 space-y-2">
            {(snapshot?.concepts ?? []).map((concept) => (
              <li key={concept.id} className="rounded border border-neutral-200 p-3 text-sm">
                <span className="font-medium">#{concept.number}</span> — {concept.status}
              </li>
            ))}
            {!loading && (snapshot?.concepts?.length ?? 0) === 0 ? <li className="text-sm text-neutral-600">No concepts yet.</li> : null}
          </ul>
        </Card>
      </main>
    </PageShell>
  );
}
