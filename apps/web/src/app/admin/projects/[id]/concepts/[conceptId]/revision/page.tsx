"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { Card, PageShell } from "@/components/page-shell";

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

export default function AdminConceptRevisionUploadPage() {
  const params = useParams<{ id: string; conceptId: string }>();
  const router = useRouter();
  const projectId = params.id;
  const conceptId = params.conceptId;

  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const backHref = useMemo(() => `/project/${projectId}/concept/${conceptId}?from=admin`, [projectId, conceptId]);

  async function uploadRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !conceptId || !file) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    const data = new FormData();
    data.set("file", file);
    data.set("conceptId", conceptId);
    data.set("uploadMode", "revision");
    data.set("assetNotes", notes);

    const response = await fetch(`/api/admin/projects/${projectId}/concepts`, {
      method: "POST",
      body: data,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(readError(payload, "Failed to upload revision"));
      setBusy(false);
      return;
    }

    setSuccess("Revision uploaded.");
    setBusy(false);
    router.push(backHref);
    router.refresh();
  }

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Upload concept revision</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <Link className="portal-link no-underline" href={backHref}>Back to concept thread</Link>
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/concepts#pending-feedback`}>Pending feedback inbox</Link>
          </div>
        </div>

        <Card className="mt-0">
          <p className="text-sm text-neutral-700">Upload the updated image for this concept. This creates a new version and marks pending revision requests as delivered.</p>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-green-700">{success}</p> : null}

          <form className="mt-4" onSubmit={uploadRevision}>
            <label className="block text-sm font-medium">Revision asset file</label>
            <input className="mt-1 block" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

            <label className="mt-4 block text-sm font-medium">Revision note (optional)</label>
            <p className="mt-1 text-xs text-neutral-600">Shown on the concept page when the client selects this revision version.</p>
            <textarea
              className="mt-2 portal-field px-2 py-1"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. What's changed in this revision and why"
            />

            <button className="mt-4 portal-btn-secondary" type="submit" disabled={busy || !file}>
              {busy ? "Uploading…" : "Upload revision"}
            </button>
          </form>
        </Card>
      </main>
    </PageShell>
  );
}
