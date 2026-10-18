"use client";

import { conceptUploadKey } from "@/lib/concept-upload-key";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/ui";

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

    const retireRequestKey = await conceptUploadKey(projectId, data);
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

    retireRequestKey();
    setSuccess("Revision uploaded.");
    setBusy(false);
    router.push(backHref);
    router.refresh();
  }

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader
        crumbs={[{ label: "Queue", href: "/admin" }, { label: `Project ${projectId}`, href: `/admin/projects/${projectId}` }, { label: "Upload concept revision" }]}
        actions={
          <div className="flex max-w-[55vw] items-center gap-2 overflow-x-auto text-sm">
            <Link className="portal-btn-ghost shrink-0" href={backHref}>Back to concept thread</Link>
            <Link className="portal-btn-ghost shrink-0" href={`/admin/projects/${projectId}/concepts#pending-feedback`}>Pending feedback inbox</Link>
          </div>
        }
      />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:py-8">
        <div className="mx-auto max-w-[920px] space-y-10">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-fg">Upload concept revision</h1>
            <p className="mt-2 text-sm text-fg-3">Project {projectId}</p>
          </div>

          <section>
            <p className="text-base text-fg-2">Upload the updated image for this concept. This creates a new version and marks pending revision requests as delivered.</p>

            {error ? <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
            {success ? <p className="mt-3 rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success">{success}</p> : null}

            <form className="mt-4" onSubmit={uploadRevision}>
              <label className="block text-sm font-medium text-fg">Revision asset file</label>
              <input className="portal-field mt-1 block" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="mt-1 text-sm text-fg-3">PNG, JPEG, or WebP only; 10 MB maximum.</p>

              <label className="mt-4 block text-sm font-medium text-fg">Revision note (optional)</label>
              <p className="mt-1 text-sm text-fg-3">Shown on the concept page when the client selects this revision version.</p>
              <textarea
                className="mt-2 portal-field"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. What's changed in this revision and why"
              />

              <button className="mt-4 portal-btn-primary" type="submit" disabled={busy || !file}>
                {busy ? "Uploading…" : "Upload revision"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </PageShell>
  );
}
