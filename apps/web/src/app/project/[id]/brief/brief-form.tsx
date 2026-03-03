"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type BriefFormProps = {
  projectId: string;
};

export function BriefForm({ projectId }: BriefFormProps) {
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [styleNotes, setStyleNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedVersion, setSubmittedVersion] = useState<number | null>(null);

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
  }

  if (submittedVersion !== null) {
    return (
      <section className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
        <h2 className="text-base font-semibold">Brief received — you’ll hear back from your designer soon.</h2>
        <p className="mt-2">
          Thanks for sharing your details. We’ve saved your brief (v{submittedVersion}) and posted a confirmation in your
          project messages.
        </p>
        <p className="mt-1 text-green-800">
          What happens next: your designer reviews your brief, starts concept work, and replies in messages with updates.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="rounded bg-black px-4 py-2 text-white" href={`/project/${projectId}/messages`}>
            Open project messages
          </Link>
          <Link className="rounded border border-green-300 bg-white px-4 py-2" href={`/project/${projectId}`}>
            Back to project
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
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
        {isSubmitting ? "Submitting..." : "Submit brief"}
      </button>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
