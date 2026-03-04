"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

import { BriefDocument, BriefField, BriefFieldGrid } from "@/components/brief-document";
import { briefSections, EMPTY_BRIEF_ANSWERS, missingRequiredFields, type BriefAnswers } from "@/lib/brief";
import { nextStepIndex, previousStepIndex } from "@/lib/brief-wizard";

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

export function BriefForm({ projectId, briefVersions }: BriefFormProps) {
  const latestBrief = briefVersions[0] ?? null;
  const [form, setForm] = useState<BriefAnswers>(latestBrief?.answers ?? EMPTY_BRIEF_ANSWERS);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedVersion, setSubmittedVersion] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(latestBrief === null);
  const [selectedVersion, setSelectedVersion] = useState<number>(latestBrief?.version ?? 0);
  const [activeStep, setActiveStep] = useState(0);

  const reviewStep = briefSections.length;
  const selectedBrief = useMemo(
    () => briefVersions.find((brief) => brief.version === selectedVersion) ?? latestBrief,
    [briefVersions, latestBrief, selectedVersion],
  );

  const currentSection = briefSections[activeStep] ?? null;
  const missingOnStep = currentSection ? missingRequiredFields(form, currentSection) : [];
  const progressPercent = Math.round(((activeStep + 1) / (briefSections.length + 1)) * 100);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch(`/api/projects/${projectId}/brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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

  function goNext() {
    if (currentSection && missingOnStep.length > 0) {
      setError(`Please complete: ${missingOnStep.join(", ")}.`);
      return;
    }
    setError(null);
    setActiveStep((current) => nextStepIndex(current, form));
  }

  function goBack() {
    setError(null);
    setActiveStep((current) => previousStepIndex(current));
  }

  function openEditor() {
    setIsEditing(true);
    setActiveStep(0);
    setError(null);
  }

  if (submittedVersion !== null) {
    return (
      <section className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
        <h2 className="text-base font-semibold">Brief saved — your designer has the latest version.</h2>
        <p className="mt-2">We saved this as v{submittedVersion}. Earlier versions remain available in brief history.</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="portal-btn-primary px-4 py-2" href={`/project/${projectId}`}>
            Back to project hub
          </Link>
          <Link className="portal-btn-secondary border-green-300" href={`/project/${projectId}/messages`}>
            Open project messages
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-4">
      {latestBrief ? (
        <BriefDocument
          title={`Latest submitted brief (v${latestBrief.version})`}
          subtitle="Review your current brief and earlier submissions in one document-style history view."
          meta={<span>Submitted {dateLabel(latestBrief.createdAt)}</span>}
          actions={(
            <button
              type="button"
              onClick={() => setIsEditing((current) => {
                if (current) return false;
                openEditor();
                return true;
              })}
              className="portal-btn-secondary"
            >
              {isEditing ? "Close editor" : "Edit & resubmit"}
            </button>
          )}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <BriefFieldGrid>
              {briefSections.map((section) => (
                <section key={section.id} className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4">
                  <h3 className="text-sm font-semibold text-neutral-900">{section.title}</h3>
                  <p className="mt-1 text-xs text-neutral-600">{section.description}</p>
                  <div className="mt-3 grid gap-3">
                    {section.fields.map((field) => (
                      <BriefField key={field.key} label={field.label} value={selectedBrief?.answers[field.key] ?? "—"} compact />
                    ))}
                  </div>
                </section>
              ))}
            </BriefFieldGrid>

            <aside className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4">
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
        </BriefDocument>
      ) : null}

      {isEditing ? (
        <form className="portal-card space-y-5 p-4 sm:p-5" onSubmit={onSubmit}>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            You can move back at any time. Submitting this form creates a new brief version and keeps the full history intact.
          </div>

          <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
              <p className="font-medium text-neutral-800">Step {Math.min(activeStep + 1, reviewStep + 1)} of {reviewStep + 1}</p>
              <p>{progressPercent}% complete</p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
              <div className="h-full rounded-full bg-neutral-900 transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <ol className="grid gap-2 text-[11px] sm:grid-cols-5">
              {briefSections.map((section, index) => (
                <li key={section.id} className={`rounded-md border px-2 py-1 ${index === activeStep ? "border-neutral-900 bg-white text-neutral-900" : "border-neutral-200 text-neutral-500"}`}>
                  {section.title}
                </li>
              ))}
              <li className={`rounded-md border px-2 py-1 ${activeStep === reviewStep ? "border-neutral-900 bg-white text-neutral-900" : "border-neutral-200 text-neutral-500"}`}>Review & submit</li>
            </ol>
          </div>

          {currentSection ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-neutral-900">{currentSection.title}</h3>
              <p className="mt-1 text-xs text-neutral-600">{currentSection.description}</p>
              <div className="mt-4 grid gap-4">
                {currentSection.fields.map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-sm" htmlFor={field.key}>
                      {field.label} {field.required ? <span className="text-red-700">*</span> : <span className="text-neutral-500">(optional)</span>}
                    </label>
                    {field.kind === "textarea" ? (
                      <textarea
                        id={field.key}
                        required={field.required}
                        value={form[field.key]}
                        maxLength={field.maxLength}
                        placeholder={field.placeholder}
                        onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                        className="portal-field"
                        rows={field.rows ?? 3}
                      />
                    ) : (
                      <input
                        id={field.key}
                        required={field.required}
                        value={form[field.key]}
                        maxLength={field.maxLength}
                        placeholder={field.placeholder}
                        onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                        className="portal-field"
                      />
                    )}
                    {field.helperText ? <p className="mt-1 text-xs text-neutral-500">{field.helperText}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-neutral-900">Final review</h3>
              <p className="text-xs text-neutral-600">Quickly review your answers before submitting. Use Back if you want to change anything.</p>
              {briefSections.map((section) => (
                <div key={section.id} className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
                  <h4 className="text-xs font-semibold text-neutral-800">{section.title}</h4>
                  <div className="mt-2 grid gap-2">
                    {section.fields.map((field) => (
                      <BriefField key={field.key} label={field.label} value={form[field.key] || "—"} compact />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={goBack} disabled={activeStep === 0} className="portal-btn-secondary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50">
              Back
            </button>
            {activeStep < reviewStep ? (
              <button type="button" onClick={goNext} className="portal-btn-primary px-4 py-2">
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="portal-btn-primary px-4 py-2"
              >
                {isSubmitting ? "Submitting..." : latestBrief ? "Create new brief version" : "Submit brief"}
              </button>
            )}
          </div>

          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
