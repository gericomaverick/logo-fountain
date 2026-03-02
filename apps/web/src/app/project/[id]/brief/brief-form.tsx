"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type BriefFormProps = {
  projectId: string;
};

export function BriefForm({ projectId }: BriefFormProps) {
  const router = useRouter();

  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [styleNotes, setStyleNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

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
      setStatus(payload?.error || "Failed to submit brief.");
      return;
    }

    setStatus(`Brief submitted (version ${payload?.version ?? "?"}).`);
    router.push(`/project/${projectId}`);
    router.refresh();
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

      {status ? <p className="text-sm text-neutral-700">{status}</p> : null}
    </form>
  );
}
