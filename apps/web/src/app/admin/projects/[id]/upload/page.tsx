"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";

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

  const [conceptNumber, setConceptNumber] = useState(1);
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
    data.set("conceptNumber", String(conceptNumber));
    data.set("notes", notes);

    const response = await fetch(`/api/admin/projects/${projectId}/concepts`, {
      method: "POST",
      body: data,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(readError(payload, "Upload failed"));
    } else {
      setSuccess(`Concept #${conceptNumber} uploaded and published.`);
      setFile(null);
      await refresh(projectId);
    }

    setBusy(false);
  }

  return (
    <>
      <HeaderNav />
      <main className="mx-auto max-w-4xl p-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Upload concepts</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <Link className="underline" href={`/admin/projects/${projectId}`}>Overview</Link>
            <Link className="underline" href={`/admin/projects/${projectId}/messages`}>Messages</Link>
          </div>
        </div>

        <section className="rounded-xl border border-neutral-200 p-4">
          <h2 className="text-lg font-medium">Upload and publish concept</h2>
          <p className="mt-1 text-sm text-neutral-600">Uploading here publishes immediately so the client can view it in project and concept detail pages.</p>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-green-700">{success}</p> : null}

          <form className="mt-4" onSubmit={uploadConcept}>
            <label className="block text-sm font-medium">Concept number</label>
            <input className="mt-1 rounded border border-neutral-300 px-2 py-1" type="number" min={1} value={conceptNumber} onChange={(e) => setConceptNumber(Number.parseInt(e.target.value || "1", 10))} />

            <label className="mt-4 block text-sm font-medium">Asset file</label>
            <input className="mt-1 block" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

            <label className="mt-4 block text-sm font-medium">Notes</label>
            <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

            <button className="mt-4 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={busy || !file}>
              {busy ? "Uploading…" : "Upload concept"}
            </button>
          </form>
        </section>

        <section className="mt-8 rounded border border-neutral-200 p-4">
          <h2 className="text-lg font-medium">Existing concepts</h2>
          {loading ? <p className="mt-3 text-sm text-neutral-600">Loading…</p> : null}
          <ul className="mt-3 space-y-2">
            {(snapshot?.concepts ?? []).map((concept) => (
              <li key={concept.id} className="rounded border border-neutral-200 p-3 text-sm">
                <span className="font-medium">#{concept.number}</span> — {concept.status}
              </li>
            ))}
            {!loading && (snapshot?.concepts?.length ?? 0) === 0 ? <li className="text-sm text-neutral-600">No concepts yet.</li> : null}
          </ul>
        </section>
      </main>
    </>
  );
}
