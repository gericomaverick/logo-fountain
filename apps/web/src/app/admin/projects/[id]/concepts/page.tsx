"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HeaderNav } from "@/components/header-nav";

type Concept = {
  id: string;
  number: number;
  revisionVersion: number;
  status: string;
  notes: string | null;
  imageUrl: string | null;
  pendingRevisionCount: number;
  commentCount: number;
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

export default function AdminProjectConceptsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [conceptNumber, setConceptNumber] = useState(1);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replaceFiles, setReplaceFiles] = useState<Record<string, File | null>>({});

  async function refresh(id: string) {
    const conceptsResponse = await fetch(`/api/admin/projects/${id}/concepts`, { cache: "no-store" });

    const conceptsPayload = await conceptsResponse.json().catch(() => null);

    if (!conceptsResponse.ok) throw new Error(readError(conceptsPayload, "Failed to load concepts"));

    setConcepts((conceptsPayload?.concepts ?? []) as Concept[]);
  }

  useEffect(() => {
    if (!projectId) return;

    const load = async () => {
      try {
        await Promise.all([
          refresh(projectId),
          fetch(`/api/projects/${projectId}/read-state`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ area: "concepts" }),
          }),
        ]);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load concepts");
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

  async function replaceConceptAsset(concept: Concept) {
    if (!projectId) return;
    const nextFile = replaceFiles[concept.id];
    if (!nextFile) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    const data = new FormData();
    data.set("file", nextFile);
    data.set("conceptId", concept.id);
    data.set("conceptNumber", String(concept.number));
    data.set("notes", concept.notes ?? "");
    data.set("uploadMode", "replace");

    const response = await fetch(`/api/admin/projects/${projectId}/concepts`, {
      method: "POST",
      body: data,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(readError(payload, `Failed to replace concept #${concept.number}`));
    } else {
      setReplaceFiles((prev) => ({ ...prev, [concept.id]: null }));
      setSuccess(`Concept #${concept.number} asset replaced.`);
      await refresh(projectId);
    }

    setBusy(false);
  }

  async function uploadRevision(concept: Concept) {
    if (!projectId) return;
    const nextFile = replaceFiles[concept.id];
    if (!nextFile) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    const data = new FormData();
    data.set("file", nextFile);
    data.set("conceptId", concept.id);
    data.set("conceptNumber", String(concept.number));
    data.set("notes", concept.notes ?? "");
    data.set("uploadMode", "revision");

    const response = await fetch(`/api/admin/projects/${projectId}/concepts`, {
      method: "POST",
      body: data,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(readError(payload, `Failed to upload revision for concept #${concept.number}`));
    } else {
      setReplaceFiles((prev) => ({ ...prev, [concept.id]: null }));
      setSuccess(`Revision uploaded for Concept #${concept.number} (v${concept.revisionVersion + 1}).`);
      await refresh(projectId);
    }

    setBusy(false);
  }

  async function deleteConcept(conceptId: string) {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    const response = await fetch(`/api/admin/projects/${projectId}/concepts/${conceptId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(readError(payload, "Delete failed"));
    } else {
      setSuccess("Concept deleted.");
      await refresh(projectId);
    }

    setBusy(false);
  }

  const totalPending = useMemo(
    () => concepts.reduce((acc, concept) => acc + concept.pendingRevisionCount + concept.commentCount, 0),
    [concepts],
  );

  return (
    <>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Concepts manager</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
            <p className="mt-1 text-sm text-neutral-600">Pending feedback items: {totalPending}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <Link className="underline" href={`/admin/projects/${projectId}`}>Overview</Link>
            <Link className="underline" href={`/admin/projects/${projectId}/messages`}>Messages</Link>
          </div>
        </div>

        <section className="rounded-xl border border-neutral-200 p-4">
          <h2 className="text-lg font-medium">Upload and publish concept</h2>
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

        <section className="mt-8">
          <h2 className="text-lg font-medium">Published concepts</h2>
          {loading ? <p className="mt-3 text-sm text-neutral-600">Loading…</p> : null}
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {concepts.map((concept) => {
              const pendingFeedbackCount = concept.pendingRevisionCount + concept.commentCount;

              return (
                <article id={`concept-${concept.id}`} key={concept.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <Link href={`/project/${projectId}/concept/${concept.id}?from=admin`} className="block transition hover:border-neutral-300">
                    {concept.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={concept.imageUrl} alt={`Concept ${concept.number}`} className="h-56 w-full object-cover" />
                    ) : (
                      <div className="flex h-56 items-center justify-center bg-neutral-100 text-sm text-neutral-500">No preview</div>
                    )}
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-neutral-900">Concept #{concept.number} · v{concept.revisionVersion}</p>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">{concept.status}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {pendingFeedbackCount > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{pendingFeedbackCount} pending</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">No pending feedback</span>
                        )}
                        {concept.pendingRevisionCount > 0 ? (
                          <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-medium text-fuchsia-800">{concept.pendingRevisionCount} revisions</span>
                        ) : null}
                        {concept.commentCount > 0 ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">{concept.commentCount} comments</span>
                        ) : null}
                      </div>
                      {concept.notes ? <p className="line-clamp-2 text-xs text-neutral-500">{concept.notes}</p> : null}
                    </div>
                  </Link>

                  <div className="space-y-2 border-t border-neutral-200 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <Link className="underline" href={`/project/${projectId}/concept/${concept.id}?from=admin`}>
                        Open discussion
                      </Link>
                      <button
                        type="button"
                        className="rounded border border-neutral-300 px-2 py-1"
                        disabled={busy || !replaceFiles[concept.id]}
                        onClick={() => {
                          void uploadRevision(concept);
                        }}
                      >
                        Upload revision
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        className="block w-full text-xs"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const nextFile = e.target.files?.[0] ?? null;
                          setReplaceFiles((prev) => ({ ...prev, [concept.id]: nextFile }));
                        }}
                      />
                      <button
                        type="button"
                        className="rounded border border-neutral-300 px-2 py-1"
                        disabled={busy || !replaceFiles[concept.id]}
                        onClick={() => {
                          void replaceConceptAsset(concept);
                        }}
                      >
                        Replace asset only
                      </button>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        className="rounded border border-neutral-300 px-2 py-1 text-red-700"
                        disabled={busy}
                        onClick={() => {
                          void deleteConcept(concept.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {!loading && concepts.length === 0 ? <p className="mt-4 text-sm text-neutral-600">No concepts yet.</p> : null}
        </section>
      </main>
    </>
  );
}
