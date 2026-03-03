"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type BriefAnswers = {
  brandName: string;
  industry: string;
  description: string;
  styleNotes: string;
};

type LatestBrief = {
  version: number;
  createdAt: string;
  answers: BriefAnswers;
};

type BriefFormProps = {
  projectId: string;
  latestBrief: LatestBrief | null;
};

function dateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleString();
}

export function BriefForm({ projectId, latestBrief }: BriefFormProps) {
  const [brandName, setBrandName] = useState(latestBrief?.answers.brandName ?? "");
  const [industry, setIndustry] = useState(latestBrief?.answers.industry ?? "");
  const [description, setDescription] = useState(latestBrief?.answers.description ?? "");
  const [styleNotes, setStyleNotes] = useState(latestBrief?.answers.styleNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedVersion, setSubmittedVersion] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(latestBrief === null);

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
        <p className="mt-2">
          We’ve saved your brief as v{submittedVersion} and posted a confirmation in project messages.
        </p>

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
        <article className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">Latest submitted brief (v{latestBrief.version})</h2>
              <p className="mt-1 text-xs text-neutral-500">Submitted {dateLabel(latestBrief.createdAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing((current) => !current)}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              {isEditing ? "Cancel edit" : "Edit & resubmit"}
            </button>
          </div>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Brand name</dt>
              <dd className="mt-1 text-sm text-neutral-900">{latestBrief.answers.brandName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Industry</dt>
              <dd className="mt-1 text-sm text-neutral-900">{latestBrief.answers.industry}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Description</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">{latestBrief.answers.description}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Style notes</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">{latestBrief.answers.styleNotes}</dd>
            </div>
          </dl>
        </article>
      ) : null}

      {isEditing ? (
        <form className="space-y-4" onSubmit={onSubmit}>
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
            {isSubmitting ? "Submitting..." : latestBrief ? "Resubmit brief" : "Submit brief"}
          </button>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
