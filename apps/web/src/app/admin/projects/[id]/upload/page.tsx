"use client";

import { conceptUploadKey } from "@/lib/concept-upload-key";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { PageHeader, Section } from "@/components/ui";
import { FeatureNoticeCard } from "@/components/feature-notice-card";

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

    const retireRequestKey = await conceptUploadKey(projectId, data);
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
      retireRequestKey();
      setFile(null);
      await refresh(projectId);
    }

    setBusy(false);
  }

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader
        crumbs={[{ label: "Queue", href: "/admin" }, { label: `Project ${projectId}`, href: `/admin/projects/${projectId}` }, { label: "Upload concepts" }]}
        actions={
          <div className="flex max-w-[55vw] items-center gap-2 overflow-x-auto text-sm">
            <Link className="portal-btn-ghost shrink-0" href={`/admin/projects/${projectId}`}>Project overview</Link>
            <Link className="portal-btn-ghost shrink-0" href={`/admin/projects/${projectId}/concepts`}>Concepts manager</Link>
            <Link className="portal-btn-ghost shrink-0" href={`/admin/projects/${projectId}/messages`}>Project messages</Link>
          </div>
        }
      />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:py-8">
        <div className="mx-auto max-w-[920px] space-y-10">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-fg">Upload concepts</h1>
            <p className="mt-2 text-sm text-fg-3">Project {projectId}</p>
          </div>

          <Section title="Upload and publish concept">
            <p className="mt-1 text-base text-fg-2">Uploading here publishes immediately so the client can review it.</p>

            {error ? <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
            {success ? <p className="mt-3 rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success">{success}</p> : null}

            <form className="mt-4" onSubmit={uploadConcept}>
              <FeatureNoticeCard variant="info" title="Concept uploads auto-assign the next concept number so new uploads cannot overwrite Concept #1 by mistake." />

              <label className="mt-4 block text-sm font-medium text-fg">Asset file</label>
              <input className="portal-field mt-1 block" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="mt-1 text-sm text-fg-3">PNG, JPEG, or WebP only; 10 MB maximum.</p>

              <label className="mt-4 block text-sm font-medium text-fg">Description / explainer</label>
              <p className="mt-1 text-sm text-fg-3">Shown to the client on the concept page. You can use multiple lines.</p>
              <textarea
                className="mt-2 portal-field"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Why this direction, what to look for, and any rationale"
              />

              <button className="mt-4 portal-btn-primary" type="submit" disabled={busy || !file}>
                {busy ? "Uploading…" : "Upload concept"}
              </button>
            </form>
          </Section>

          <Section title="Existing concepts">
            <div className="flex items-center justify-between gap-3">
              <Link className="portal-link text-sm" href={`/admin/projects/${projectId}/concepts`}>Open concepts manager + feedback inbox</Link>
            </div>
            {loading ? <p className="mt-3 text-sm text-fg-2">Loading…</p> : null}
            <ul className="mt-3 space-y-2">
              {(snapshot?.concepts ?? []).map((concept) => (
                <li key={concept.id} className="rounded border border-line p-3 text-base">
                  <span className="font-medium">#{concept.number}</span> — {concept.status}
                </li>
              ))}
              {!loading && (snapshot?.concepts?.length ?? 0) === 0 ? <li className="text-sm text-fg-2">No concepts yet.</li> : null}
            </ul>
          </Section>
        </div>
      </main>
    </PageShell>
  );
}
