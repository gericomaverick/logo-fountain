"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { BriefDocument, BriefField, BriefFieldGrid, BriefSection } from "@/components/brief-document";
import { BriefFieldInput } from "@/components/brief-field-input";
import { BriefProgress } from "@/components/brief-progress";
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
  // Until the saved draft has been fetched, saving would overwrite it with
  // whatever this tab happens to be showing.
  const [draftLoaded, setDraftLoaded] = useState(latestBrief !== null);
  const [draftOffline, setDraftOffline] = useState(false);
  const editorRef = useRef<HTMLFormElement | null>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const reviewStep = briefSections.length;
  const stepLabels = [...briefSections.map((section) => section.title), "Review"];

  function goToStep(index: number) {
    // Only backwards: moving on is the Continue button's job, which checks answers.
    if (index >= activeStep) return;
    setError(null);
    setActiveStep(index);
  }

  const currentSection = briefSections[activeStep] ?? null;
  const missingOnStep = currentSection ? missingRequiredFields(form, currentSection) : [];
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

  // A draft belongs to the person, not the tab: pick up whatever they last
  // wrote, on whichever device they wrote it.
  useEffect(() => {
    if (latestBrief !== null) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/brief/draft`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load draft");
        const payload = (await response.json().catch(() => null)) as
          | { draft?: { answers?: BriefAnswers; updatedAt?: string } | null }
          | null;
        if (cancelled) return;

        const saved = payload?.draft?.answers;
        if (saved) {
          // Anything typed in this tab before the fetch landed wins: it is newer.
          setForm((current) => (hasBriefAnswerChanges(current, EMPTY_BRIEF_ANSWERS) ? current : mergeWithBriefDefaults(saved)));
          const savedAt = payload?.draft?.updatedAt ? new Date(payload.draft.updatedAt) : null;
          setDraftSavedAt(savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt : null);
        }
      } catch {
        if (!cancelled) setDraftOffline(true);
      } finally {
        if (!cancelled) setDraftLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [latestBrief, projectId]);

  useEffect(() => {
    if (typeof window === "undefined" || submittedVersion !== null || !isEditing || !draftLoaded) return;

    const timeout = window.setTimeout(() => {
      // Written locally first so a refresh mid-sentence never loses anything,
      // then to the account so another device can pick it up.
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify(form));

      void (async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}/brief/draft`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers: form }),
          });
          if (!response.ok) throw new Error("Could not save draft");
          setDraftOffline(false);
          setDraftSavedAt(new Date());
        } catch {
          // The local copy still holds; say so rather than claiming a save.
          setDraftOffline(true);
        }
      })();
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [draftLoaded, draftStorageKey, form, isEditing, projectId, submittedVersion]);

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
        title="Your brief is in — your designer now has your submission"
        body="Your brief has been submitted and is now locked for client editing."
        signature="— Logo Fountain team"
        actions={(
          <>
            <Link className="portal-btn-primary px-4 py-2" href={`/project/${projectId}`}>
              Back to project overview
            </Link>
            <Link className="portal-btn-secondary" href={`/project/${projectId}/messages`}>
              Open project messages
            </Link>
          </>
        )}
      />
    );
  }

  return (
    <section className="space-y-6">
      {latestBrief ? (
        <BriefDocument
          title={`Latest submitted brief (v${latestBrief.version})`}
          subtitle="Your brief is now locked. Review your submitted answers below."
          meta={<span>Submitted {dateLabel(latestBrief.createdAt)}</span>}
        >
          <FeatureNoticeCard
            variant="success"
            className="mb-4 p-4"
            title="Brief submission complete"
            body="Editing and re-submission are now disabled for clients."
            contentClassName="max-w-none"
          />
          <BriefFieldGrid>
            {briefSections.map((section) => (
              <BriefSection key={section.id} title={section.title} description={section.description} tone="paper">
                <div className="grid gap-3 md:grid-cols-2">
                  {section.fields.map((field) => (
                    <BriefField key={field.key} label={field.label} value={latestBrief.answers[field.key] ?? "—"} compact valueClassName="text-base leading-7" />
                  ))}
                </div>
              </BriefSection>
            ))}
          </BriefFieldGrid>
        </BriefDocument>
      ) : null}

      {isEditing ? (
        <form id="brief-editor-form" ref={editorRef} className="scroll-mt-24 space-y-6" onSubmit={onSubmitIntent}>
          <h3
            ref={editorHeadingRef}
            tabIndex={-1}
            className="sr-only focus:not-sr-only focus:mb-2 focus:rounded-md focus:bg-surface-2 focus:px-2 focus:py-1 focus:text-sm focus:font-semibold"
          >
            Brief editor
          </h3>

          <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-12">
            {/* The rail sits beside the questions and follows them down. */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <BriefProgress labels={stepLabels} activeIndex={activeStep} onSelect={goToStep} />
              </div>
            </aside>

            <div className="min-w-0 space-y-6">

          <FeatureNoticeCard
            variant="info"
            className="p-4"
            title="There are no wrong answers here"
            body={(
              <>
                <p>Tell us what you can, in your own words. The more we know about your brand, the sharper your first concepts will be — but a half-finished thought is still more useful to your designer than a blank box.</p>
                <p className="mt-3 text-base text-fg-2">Takes about five minutes. Everything saves as you go, so you can stop and come back whenever you like, on any device. Nothing reaches your designer until you review it and press submit.</p>
              </>
            )}
          />

          {/* The rail carries position; a line of metadata carries the save. */}
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <BriefProgress labels={stepLabels} activeIndex={activeStep} onSelect={goToStep} />
          </div>
          <p className="text-sm text-fg-3" aria-live="polite">
            {draftOffline
              ? "Saved on this device"
              : draftSavedAt
                ? `Saved ${draftSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Saves as you go"}
          </p>

          {currentSection ? (
            <section className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight text-fg">{currentSection.title}</h3>
              <p className="mt-2 max-w-[60ch] text-base text-fg-2">{currentSection.description}</p>
              <p className="mt-2 text-sm text-fg-3"><span className="text-danger">*</span> Required fields · Optional fields are clearly marked.</p>
              <div className="mt-4 grid gap-4">
                {currentSection.fields.map((field) => (
                  <BriefFieldInput
                    key={field.key}
                    field={field}
                    value={form[field.key]}
                    onChange={(next) => setForm((current) => ({ ...current, [field.key]: next }))}
                  />
                ))}
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              <h3 className="text-lg font-semibold tracking-tight text-fg">Final review</h3>
              <p className="max-w-[60ch] text-base text-fg-2">Quickly review your answers before submitting. Use Back if you want to change anything.</p>
              {briefSections.map((section) => (
                <div key={section.id} className="rounded-lg border border-line bg-surface p-3">
                  <h4 className="text-base font-semibold text-fg">{section.title}</h4>
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
                className={showSubmitConfirmation ? "portal-btn-secondary px-4 py-2" : "portal-btn-primary px-4 py-2"}
              >
                {isSubmitting ? "Submitting..." : "Submit brief"}
              </button>
            ) : null}
          </div>

          {hasUnsavedChanges ? <p className="text-sm text-warning">You have unsaved changes in this version. Submit when ready.</p> : null}
          {error ? <p className="text-base text-danger" role="alert">{error}</p> : null}

          {showSubmitConfirmation ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-fg/40 px-4" role="dialog" aria-modal="true" aria-labelledby="brief-submit-confirm-title">
              <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-2xl">
                <h4 id="brief-submit-confirm-title" className="text-lg font-semibold text-fg">
                  {BRIEF_SUBMISSION_CONFIRMATION_COPY.title}
                </h4>
                <p className="mt-2 text-base text-fg-2">{BRIEF_SUBMISSION_CONFIRMATION_COPY.body}</p>

                <label className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-surface p-3 text-base text-fg">
                  <input
                    type="checkbox"
                    checked={submissionAcknowledged}
                    onChange={(event) => setSubmissionAcknowledged(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-accent"
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
            </div>
          </div>
        </form>
      ) : null}
    </section>
  );
}
