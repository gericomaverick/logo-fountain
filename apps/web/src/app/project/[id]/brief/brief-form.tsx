"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { BriefDocument, BriefField, BriefFieldGrid, BriefSection } from "@/components/brief-document";
import { FeatureNoticeCard } from "@/components/feature-notice-card";
import { briefSections, EMPTY_BRIEF_ANSWERS, missingRequiredFields, requiredFieldLabels, type BriefAnswers } from "@/lib/brief";
import {
  BRIEF_SUBMISSION_CONFIRMATION_COPY,
  canConfirmBriefSubmission,
  shouldShowBriefSubmitAction,
} from "@/lib/brief-submission-confirmation";
import { briefDraftStorageKey, hasBriefAnswerChanges, mergeWithBriefDefaults, parseBriefDraft } from "@/lib/brief-draft";
import { nextStepIndex, previousStepIndex } from "@/lib/brief-wizard";
import { scrollAndFocusEditor } from "./editor-focus";

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
  const draftStorageKey = briefDraftStorageKey(projectId, latestBrief?.version ?? null);
  const initialFormState = useMemo(() => {
    if (typeof window !== "undefined") {
      const draft = parseBriefDraft(window.sessionStorage.getItem(draftStorageKey));
      if (draft) return mergeWithBriefDefaults(draft);
    }

    return latestBrief?.answers ?? EMPTY_BRIEF_ANSWERS;
  }, [draftStorageKey, latestBrief?.answers]);

  const [form, setForm] = useState<BriefAnswers>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedVersion, setSubmittedVersion] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(latestBrief === null);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [submissionAcknowledged, setSubmissionAcknowledged] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const editorRef = useRef<HTMLFormElement | null>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const reviewStep = briefSections.length;

  const currentSection = briefSections[activeStep] ?? null;
  const missingOnStep = currentSection ? missingRequiredFields(form, currentSection) : [];
  const progressPercent = Math.round(((activeStep + 1) / (briefSections.length + 1)) * 100);
  const hasUnsavedChanges = isEditing && hasBriefAnswerChanges(form, latestBrief?.answers ?? EMPTY_BRIEF_ANSWERS);

  async function submitBrief() {
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

    setShowSubmitConfirmation(false);
    setSubmissionAcknowledged(false);
    setSubmittedVersion(payload?.version ?? null);
    setIsEditing(false);
    setDraftSavedAt(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(draftStorageKey);
    }
  }

  function onSubmitIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setShowSubmitConfirmation(true);
  }

  async function onConfirmSubmit() {
    if (!canConfirmBriefSubmission(submissionAcknowledged)) return;
    await submitBrief();
  }

  function onCancelSubmitConfirmation() {
    setShowSubmitConfirmation(false);
    setSubmissionAcknowledged(false);
  }

  function goNext() {
    if (currentSection && missingOnStep.length > 0) {
      setError(`Please complete: ${requiredFieldLabels(missingOnStep, currentSection).join(", ")}.`);
      return;
    }
    setError(null);
    setActiveStep((current) => nextStepIndex(current, form));
  }

  function goBack() {
    setError(null);
    setActiveStep((current) => previousStepIndex(current));
  }

  function focusEditorSection() {
    scrollAndFocusEditor(editorRef.current, editorHeadingRef.current, (cb) => {
      window.requestAnimationFrame(cb);
    });
  }

  useEffect(() => {
    if (!isEditing) return;
    focusEditorSection();
  }, [isEditing]);

  useEffect(() => {
    if (typeof window === "undefined" || submittedVersion !== null || !isEditing) return;

    const timeout = window.setTimeout(() => {
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify(form));
      setDraftSavedAt(new Date());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [draftStorageKey, form, isEditing, submittedVersion]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasUnsavedChanges || isSubmitting) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges, isSubmitting]);

  if (submittedVersion !== null) {
    return (
      <FeatureNoticeCard
        variant="success"
        className="mt-6"
        kicker="Brief submitted"
        title="Your brief is in — your designer now has your submission"
        body="Your brief has been submitted and is now locked for client editing."
        signature="— Logo Fountain team"
        actions={(
          <>
            <Link className="portal-btn-primary px-4 py-2" href={`/project/${projectId}`}>
              Back to project overview
            </Link>
            <Link className="portal-btn-secondary border-emerald-300 text-emerald-900 hover:border-emerald-400" href={`/project/${projectId}/messages`}>
              Open project messages
            </Link>
          </>
        )}
      />
    );
  }

  return (
    <section className="mt-6 space-y-4">
      {latestBrief ? (
        <BriefDocument
          title={`Latest submitted brief (v${latestBrief.version})`}
          subtitle="Your brief is now locked. Review your submitted answers below."
          meta={<span>Submitted {dateLabel(latestBrief.createdAt)}</span>}
        >
          <FeatureNoticeCard
            variant="success"
            className="mb-4 p-4"
            kicker="Brief status"
            title="Brief submission complete"
            body="Editing and re-submission are now disabled for clients."
            contentClassName="max-w-none"
          />
          <BriefFieldGrid>
            {briefSections.map((section) => (
              <BriefSection key={section.id} title={section.title} description={section.description} tone="paper">
                <div className="grid gap-3 md:grid-cols-2">
                  {section.fields.map((field) => (
                    <BriefField key={field.key} label={field.label} value={latestBrief.answers[field.key] ?? "—"} compact valueClassName="text-[15px] leading-7" />
                  ))}
                </div>
              </BriefSection>
            ))}
          </BriefFieldGrid>
        </BriefDocument>
      ) : null}

      {isEditing ? (
        <form id="brief-editor-form" ref={editorRef} className="portal-card scroll-mt-24 space-y-5 p-4 sm:p-5" onSubmit={onSubmitIntent}>
          <h3
            ref={editorHeadingRef}
            tabIndex={-1}
            className="sr-only focus:not-sr-only focus:mb-2 focus:rounded-md focus:bg-neutral-100 focus:px-2 focus:py-1 focus:text-sm focus:font-semibold"
          >
            Brief editor
          </h3>

          <FeatureNoticeCard
            variant="info"
            className="p-4"
            kicker="From the Logo Fountain team"
            title="Set us up with a strong brief"
            body={(
              <>
                <p>The more specific your brief, the stronger your logo concepts will be. A few extra details now helps us design faster and with much better precision.</p>
                <p className="mt-2 text-xs text-violet-900/90">You can move back at any time before submitting. Once submitted, your brief is locked.</p>
              </>
            )}
          />

          <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
              <p className="font-medium text-neutral-800">Step {Math.min(activeStep + 1, reviewStep + 1)} of {reviewStep + 1}</p>
              <div className="flex items-center gap-3">
                <p>{progressPercent}% complete</p>
                <p className="rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-[11px] text-neutral-700" aria-live="polite">
                  {draftSavedAt ? `Draft saved ${draftSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Draft autosaves in this tab"}
                </p>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
              <div className="h-full rounded-full bg-neutral-900 transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <ol className="flex gap-2 overflow-x-auto pb-1 text-[11px] [scrollbar-width:thin]">
              {briefSections.map((section, index) => (
                <li key={section.id} className={`shrink-0 rounded-md border px-2 py-1 ${index === activeStep ? "border-neutral-900 bg-white text-neutral-900" : "border-neutral-200 text-neutral-500"}`}>
                  {section.title}
                </li>
              ))}
              <li className={`shrink-0 rounded-md border px-2 py-1 ${activeStep === reviewStep ? "border-neutral-900 bg-white text-neutral-900" : "border-neutral-200 text-neutral-500"}`}>Review & submit</li>
            </ol>
          </div>

          {currentSection ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-neutral-900">{currentSection.title}</h3>
              <p className="mt-1 text-xs text-neutral-600">{currentSection.description}</p>
              <p className="mt-2 text-[11px] text-neutral-500"><span className="text-red-700">*</span> Required fields · Optional fields are clearly marked.</p>
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
            ) : shouldShowBriefSubmitAction(Boolean(latestBrief)) ? (
              <button
                type="submit"
                disabled={isSubmitting}
                className="portal-btn-primary px-4 py-2"
              >
                {isSubmitting ? "Submitting..." : "Submit brief"}
              </button>
            ) : null}
          </div>

          {hasUnsavedChanges ? <p className="text-xs text-amber-700">You have unsaved changes in this version. Submit when ready.</p> : null}
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}

          {showSubmitConfirmation ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="brief-submit-confirm-title">
              <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl">
                <h4 id="brief-submit-confirm-title" className="text-lg font-semibold text-neutral-900">
                  {BRIEF_SUBMISSION_CONFIRMATION_COPY.title}
                </h4>
                <p className="mt-2 text-sm text-neutral-700">{BRIEF_SUBMISSION_CONFIRMATION_COPY.body}</p>

                <label className="mt-4 flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
                  <input
                    type="checkbox"
                    checked={submissionAcknowledged}
                    onChange={(event) => setSubmissionAcknowledged(event.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>{BRIEF_SUBMISSION_CONFIRMATION_COPY.checkboxLabel}</span>
                </label>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={onCancelSubmitConfirmation} className="portal-btn-secondary px-4 py-2">
                    {BRIEF_SUBMISSION_CONFIRMATION_COPY.cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmSubmit}
                    disabled={!canConfirmBriefSubmission(submissionAcknowledged) || isSubmitting}
                    className="portal-btn-primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? "Submitting..." : BRIEF_SUBMISSION_CONFIRMATION_COPY.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
