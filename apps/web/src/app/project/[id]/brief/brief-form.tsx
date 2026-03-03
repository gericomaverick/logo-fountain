"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

type BriefAnswers = {
  brandName: string;
  industry: string;
  description: string;
  styleNotes: string;
};

type BriefVersion = {
  id: string;
  version: number;
  createdAt: string;
  answers: BriefAnswers;
};

type BriefFormProps = {
  projectId: string;
  briefVersions: BriefVersion[];
};

function dateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleString();
}

function ReadOnlySection({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{label}</dt>
      <dd className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-900">{value}</dd>
    </div>
  );
}

export function BriefForm({ projectId, briefVersions }: BriefFormProps) {
  const latestBrief = briefVersions[0] ?? null;
  const [brandName, setBrandName] = useState(latestBrief?.answers.brandName ?? "");
  const [industry, setIndustry] = useState(latestBrief?.answers.industry ?? "");
  const [description, setDescription] = useState(latestBrief?.answers.description ?? "");
  const [styleNotes, setStyleNotes] = useState(latestBrief?.answers.styleNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedVersion, setSubmittedVersion] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(latestBrief === null);
  const [selectedVersion, setSelectedVersion] = useState<number>(latestBrief?.version ?? 0);

  const selectedBrief = useMemo(
    () => briefVersions.find((brief) => brief.version === selectedVersion) ?? latestBrief,
    [briefVersions, latestBrief, selectedVersion],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch(`/api/projects/${projectId}/brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandName,
        industry,
        description,
        styleNotes,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string; version?: number } | null;

    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload?.error || "Failed to submit brief.");
      return;
    }

    setSubmittedVersion(payload?.version ?? null);
    setIsEditing(false);
  }

  if (submittedVersion !== null) {
    return (
      <section className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
        <h2 className="text-base font-semibold">Brief saved — your designer has the latest version.</h2>
        <p className="mt-2">We saved this as v{submittedVersion}. Earlier versions remain available in brief history.</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="rounded bg-black px-4 py-2 text-white" href={`/project/${projectId}`}>
            Back to project hub
          </Link>
          <Link className="rounded border border-green-300 bg-white px-4 py-2" href={`/project/${projectId}/messages`}>
            Open project messages
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-4">
      {latestBrief ? (
        <article className="rounded-2xl border border-neutral-200 bg-gradient-to-b from-white to-neutral-50 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Latest submitted brief (v{latestBrief.version})</h2>
              <p className="mt-1 text-xs text-neutral-500">Submitted {dateLabel(latestBrief.createdAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing((current) => !current)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              {isEditing ? "Close editor" : "Edit & resubmit"}
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
            <dl className="grid gap-3">
              <ReadOnlySection label="Brand name" value={selectedBrief?.answers.brandName ?? "—"} />
              <ReadOnlySection label="Industry" value={selectedBrief?.answers.industry ?? "—"} />
              <ReadOnlySection label="Brand description" value={selectedBrief?.answers.description ?? "—"} />
              <ReadOnlySection label="Style notes" value={selectedBrief?.answers.styleNotes ?? "—"} />
            </dl>

            <aside className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Version history</p>
              <ul className="mt-3 space-y-2">
                {briefVersions.map((brief) => (
                  <li key={brief.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedVersion(brief.version)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${selectedVersion === brief.version ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700"}`}
                    >
                      <p className="font-semibold">v{brief.version}</p>
                      <p className="mt-1 opacity-80">{dateLabel(brief.createdAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </article>
      ) : null}

      {isEditing ? (
        <form className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5" onSubmit={onSubmit}>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Editing and submitting this form creates a new brief version. Previous versions stay visible in history.
          </div>
          <div>
            <label className="mb-1 block text-sm" htmlFor="brandName">Brand name</label>
            <input
              id="brandName"
              required
              value={brandName}
              onChange={(event) => setBrandName(event.target.value)}
              className="w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor="industry">Industry</label>
            <input
              id="industry"
              required
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              className="w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor="description">Description</label>
            <textarea
              id="description"
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-28 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor="styleNotes">Style notes</label>
            <textarea
              id="styleNotes"
              required
              value={styleNotes}
              onChange={(event) => setStyleNotes(event.target.value)}
              className="min-h-24 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : latestBrief ? "Create new brief version" : "Submit brief"}
          </button>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
