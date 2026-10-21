"use client";

import { Fragment, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { BriefDocument, BriefField, BriefFieldGrid, BriefSection } from "@/components/brief-document";
import { BriefFieldInput } from "@/components/brief-field-input";
import { BriefProgress } from "@/components/brief-progress";
import { FeatureNoticeCard } from "@/components/feature-notice-card";
import { briefSections, EMPTY_BRIEF_ANSWERS, missingRequiredFields, normalizeBriefAnswers, requiredFieldLabels, type BriefAnswers } from "@/lib/brief";
import {
  BRIEF_SUBMISSION_CONFIRMATION_COPY,
  canConfirmBriefSubmission,
  shouldShowBriefSubmitAction,
} from "@/lib/brief-submission-confirmation";
import { briefDraftStorageKey, hasBriefAnswerChanges, mergeWithBriefDefaults, parseBriefDraft } from "@/lib/brief-draft";
import { canAdvanceFromStep, nextStepIndex, previousStepIndex } from "@/lib/brief-wizard";
import { BriefNavigation } from "./brief-navigation";
import { fieldFeedback, savePresentation, type SaveRecord } from "./brief-feedback";
import { CheckIcon, HistoryIcon, MonitorIcon, AlertIcon } from "@/components/icons";

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
      try {
        const draft = parseBriefDraft(window.sessionStorage.getItem(draftStorageKey));
        if (draft) return mergeWithBriefDefaults(draft);
      } catch { /* Storage may be blocked. Do not prevent editing. */ }
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
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const lastSaveOutcome = useRef("");
  const [saveRetry, setSaveRetry] = useState(0);
  const [saveRecord, setSaveRecord] = useState<SaveRecord | null>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof BriefAnswers, boolean>>>({});
  const [attempted, setAttempted] = useState<Array<keyof BriefAnswers>>([]);
  const [validationSummary, setValidationSummary] = useState<string | null>(null);
  // Until the saved draft has been fetched, saving would overwrite it with
  // whatever this tab happens to be showing.
  const [draftLoaded, setDraftLoaded] = useState(latestBrief !== null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingFieldFocus = useRef<keyof BriefAnswers | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const submittingRef = useRef(false);
  submittingRef.current = isSubmitting;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const editorRef = useRef<HTMLFormElement | null>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const reviewStep = briefSections.length;
  const stepLabels = [...briefSections.map((section) => section.title), "Review"];

  function goToStep(index: number) {
    // Only backwards: moving on is the Continue button's job, which checks answers.
    if (index >= activeStep) return;
    setError(null);
    setValidationSummary(null);
    setActiveStep(index);
  }

  const currentSection = briefSections[activeStep] ?? null;
  const normalized = normalizeBriefAnswers(form)!;
  const snapshot = JSON.stringify(form);
  const visibleMissing = currentSection ? missingRequiredFields(normalized, currentSection).filter((key) => attempted.includes(key)) : [];
  const shortened = briefSections.some((section) => section.fields.some((field) => form[field.key].trim().length > (field.maxLength ?? 800)));
  const saveStatus = savePresentation(snapshot, draftLoaded, saveRecord, shortened);
  const SaveIcon = saveStatus.kind === "saved" ? CheckIcon : saveStatus.kind === "device" ? MonitorIcon : saveStatus.kind === "warning" ? AlertIcon : HistoryIcon;
  const hasUnsavedChanges = isEditing && hasBriefAnswerChanges(form, latestBrief?.answers ?? EMPTY_BRIEF_ANSWERS);

  useEffect(() => {
    if (saveStatus.kind === "pending") { setSaveAnnouncement(""); return; }
    if (saveStatus.kind === "saved" && lastSaveOutcome.current === "saved") return;
    lastSaveOutcome.current = saveStatus.kind;
    setSaveAnnouncement(saveStatus.text);
  }, [saveStatus.kind, saveStatus.text]);

  async function submitBrief() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/brief`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; version?: number } | null;
      if (!response.ok) { setError(payload?.error || "Failed to submit brief."); return; }
      setShowSubmitConfirmation(false);
      setSubmissionAcknowledged(false);
      setSubmittedVersion(payload?.version ?? null);
      setIsEditing(false);
      setSaveRecord(null);
      try { window.sessionStorage.removeItem(draftStorageKey); } catch { /* Submission already succeeded. */ }
    } catch {
      setError("Could not submit your brief. Your answers are still here; please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function focusField(key: keyof BriefAnswers) {
    // Wait for the section render and conservative editing-focus footer fallback.
    requestAnimationFrame(() => {
      const row = editorRef.current?.querySelector<HTMLElement>(`[data-brief-field="${key}"]`);
      const control = row?.querySelector<HTMLElement>("button[aria-pressed], input, textarea");
      control?.focus({ preventScroll: true });
      requestAnimationFrame(() => control?.scrollIntoView({ block: "center" }));
    });
  }

  function exposeMissing(keys: Array<keyof BriefAnswers>, sectionIndex: number) {
    setAttempted((current) => [...new Set([...current, ...keys])]);
    const section = briefSections[sectionIndex];
    setValidationSummary(`Cannot continue. ${keys.length} required answer${keys.length === 1 ? " is" : "s are"} missing in ${section.title}.`);
    setError(null);
    if (sectionIndex !== activeStep) {
      pendingFieldFocus.current = keys[0];
      setActiveStep(sectionIndex);
    } else focusField(keys[0]);
  }

  function requestSubmission() {
    const missing = missingRequiredFields(normalized);
    if (missing.length) {
      const index = briefSections.findIndex((section) => section.fields.some((field) => field.key === missing[0]));
      exposeMissing(missing.filter((key) => briefSections[index].fields.some((field) => field.key === key)), index);
      return;
    }
    setValidationSummary(null);
    setError(null);
    setSubmissionAcknowledged(false);
    setShowSubmitConfirmation(true);
  }

  function onSubmitIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeStep < reviewStep) { goNext(); return; }
    requestSubmission();
  }

  async function onConfirmSubmit() {
    if (!canConfirmBriefSubmission(submissionAcknowledged)) return;
    await submitBrief();
  }

  function onCancelSubmitConfirmation() {
    if (isSubmitting) return;
    setShowSubmitConfirmation(false);
    setSubmissionAcknowledged(false);
  }

  function goNext() {
    const gate = canAdvanceFromStep(form, activeStep);
    if (!gate.ok) { exposeMissing(gate.missing, activeStep); return; }
    setError(null);
    setValidationSummary(null);
    setActiveStep((current) => nextStepIndex(current, form));
  }

  function goBack() {
    setError(null);
    setValidationSummary(null);
    setActiveStep((current) => previousStepIndex(current));
  }

  useEffect(() => {
    if (!isEditing) return;
    const key = pendingFieldFocus.current;
    pendingFieldFocus.current = null;
    if (key) { focusField(key); return; }
    const heading = stepHeadingRef.current ?? editorHeadingRef.current;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start" });
  }, [isEditing, activeStep]);

  useEffect(() => {
    if (!showSubmitConfirmation) return;
    const dialog = dialogRef.current;
    const opener = submitButtonRef.current;
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? []);
    controls()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !submittingRef.current) {
        event.preventDefault(); setShowSubmitConfirmation(false); setSubmissionAcknowledged(false);
      }
      if (event.key === "Tab") {
        const items = controls();
        const first = items[0], last = items[items.length - 1];
        if (!first || !dialog?.contains(document.activeElement)) {
          event.preventDefault(); (first ?? dialog)?.focus(); return;
        }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus(); };
  }, [showSubmitConfirmation]);

  useEffect(() => {
    if (showSubmitConfirmation && !isSubmitting && document.activeElement === dialogRef.current) {
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button");
      buttons?.[buttons.length - 1]?.focus();
    }
  }, [showSubmitConfirmation, isSubmitting]);

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
          // Only this exact snapshot can be shown as account-saved. Local text may win.
          setSaveRecord({ snapshot: JSON.stringify(mergeWithBriefDefaults(saved)), phase: "saved", local: false, updatedAt: payload.draft?.updatedAt });
        }
      } catch {
        // No account-save claim; the next save attempt reports its own outcome.
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

    let cancelled = false;
    const currentSnapshot = JSON.stringify(form);
    const timeout = window.setTimeout(() => {
      let local = false;
      try { window.sessionStorage.setItem(draftStorageKey, currentSnapshot); local = true; } catch { /* Report only proven retention. */ }
      setSaveRecord({ snapshot: currentSnapshot, phase: "saving", local });
      // Serialize PUTs so an older in-flight write cannot land after a newer write.
      saveQueue.current = saveQueue.current.then(async () => {
        if (cancelled) return;
        try {
          const response = await fetch(`/api/projects/${projectId}/brief/draft`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: form }),
          });
          if (!response.ok) throw new Error("Could not save draft");
          const payload = await response.json().catch(() => null) as { updatedAt?: string } | null;
          if (!cancelled) setSaveRecord({ snapshot: currentSnapshot, phase: "saved", local, updatedAt: payload?.updatedAt });
        } catch {
          if (!cancelled) setSaveRecord({ snapshot: currentSnapshot, phase: "failed", local });
        }
      });
    }, 800);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [draftLoaded, draftStorageKey, form, isEditing, projectId, submittedVersion, saveRetry]);

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
        body="That’s everything we need to make a start. You can’t change the brief now it’s with your designer — if something needs correcting, send them a message and they’ll pick it up."
        signature="— Logo Fountain team"
        actions={(
          <>
            <Link className="portal-btn-on-block" href={`/project/${projectId}`}>
              Back to project overview
            </Link>
            <Link className="portal-btn-on-block-ghost" href={`/project/${projectId}/messages`}>
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
          title="Your brief"
          subtitle="This is the brief your designer is working from."
          meta={<span>Submitted {dateLabel(latestBrief.createdAt)}</span>}
        >
          <FeatureNoticeCard
            variant="success"
            className="mb-4 p-4"
            title="Sent to your designer"
            body="To change anything now, send your designer a message."
            contentClassName="max-w-none"
          />
          <BriefFieldGrid>
            {briefSections.map((section) => (
              <BriefSection key={section.id} title={section.title} description={section.description} tone="paper">
                <div className="flex flex-col">
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
        <form id="brief-editor-form" ref={editorRef} className="scroll-mt-24 space-y-6 [&_button:focus-visible]:ring-accent" noValidate onSubmit={onSubmitIntent}>
          <h3
            ref={editorHeadingRef}
            tabIndex={-1}
            className="sr-only focus:not-sr-only focus:mb-2 focus:rounded-md focus:bg-surface-2 focus:px-2 focus:py-1 focus:text-sm focus:font-semibold"
          >
            Brief editor
          </h3>

          <div inert={showSubmitConfirmation}>
            <div className="flex min-w-0 flex-col gap-4 sm:gap-6">

          {/* Position lives in the bottom navigation; save metadata stays with the questions. */}
          {currentSection ? (
            <div>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="scroll-mt-24 text-lg font-semibold tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{currentSection.title}</h2>
              <p className="mt-2 max-w-[56ch] text-base leading-relaxed text-fg-2">{currentSection.description}</p>
            </div>
          ) : (
            <div>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="scroll-mt-24 text-lg font-semibold tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Final review</h2>
              <p className="mt-2 text-base text-fg-2">Quickly review your answers before submitting. Use Back if you want to change anything.</p>
            </div>
          )}
          <p className="flex min-h-10 items-start gap-2 text-sm text-fg-2 lg:min-h-6" data-brief-save>
            <SaveIcon size={16} className={`mt-0.5 shrink-0 ${saveStatus.kind === "device" || saveStatus.kind === "warning" ? "text-warning" : ""}`} /><span>{saveStatus.text}</span>
          </p>
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{saveAnnouncement}</span>
          {saveRecord?.snapshot === snapshot && saveRecord.phase === "failed" ? (
            <button type="button" className="portal-link self-start" onClick={() => setSaveRetry((current) => current + 1)}>Retry save</button>
          ) : null}

          {currentSection ? (
            <section>
              <div className="divide-y divide-line rounded-xl border border-line bg-surface">
                {currentSection.fields.map((field, fieldIndex) => (
                  <Fragment key={field.key}>
                    <div className="p-4 sm:p-6">
                      <BriefFieldInput
                        field={field}
                        value={form[field.key]}
                        onChange={(next) => { setValidationSummary(null); setForm((current) => ({ ...current, [field.key]: next })); }}
                        onTouched={() => setTouched((current) => ({ ...current, [field.key]: true }))}
                        {...fieldFeedback(field, form[field.key], Boolean(touched[field.key]), attempted.includes(field.key))}
                      />
                    </div>
                    {fieldIndex === 0 ? (
                      <>
                        {activeStep === 0 ? (
                          <div className="space-y-2 p-4 text-base leading-normal text-fg-2 sm:p-6 sm:leading-relaxed">
                            <h3 className="font-semibold text-fg">There are no wrong answers here</h3>
                            <p>Tell us what you can, in your own words. The more we know about your brand, the sharper your first concepts will be — but a half-finished thought is still more useful to your designer than a blank box.</p>
                            <p>Takes about five minutes. Everything saves as you go, so you can stop and come back whenever you like, on any device. Nothing reaches your designer until you review it and press submit.</p>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </Fragment>
                ))}
              </div>
              <p className="mt-3 text-base text-fg-2">
                <span className="text-danger">*</span> Required. Everything else is optional.
              </p>
            </section>
          ) : (
            <section className="space-y-4">
              {briefSections.map((section) => (
                <div key={section.id} className="rounded-lg border border-line bg-surface p-3">
                  <h3 className="text-base font-semibold text-fg">{section.title}</h3>
                  <div className="mt-2 grid gap-2">
                    {section.fields.map((field) => (
                      <BriefField key={field.key} label={field.label} value={form[field.key] || "—"} compact />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {validationSummary ? <span className="sr-only" role="alert" aria-atomic="true">{validationSummary}</span> : null}
          {validationSummary && visibleMissing.length ? (
            <p className="text-base text-danger" data-validation-summary>Please complete: {requiredFieldLabels(visibleMissing, currentSection ?? undefined).join(", ")}.</p>
          ) : null}
          {hasUnsavedChanges ? <p className="text-base text-fg-2">You have unsaved changes in this version. Submit when ready.</p> : null}
          {error && !showSubmitConfirmation ? <p className="text-base text-danger" role="alert">{error}</p> : null}
          <BriefNavigation timeline={<BriefProgress labels={stepLabels} activeIndex={activeStep} onSelect={goToStep} />} stage={`Step ${activeStep + 1} of ${stepLabels.length} · ${stepLabels[activeStep]}`} modal={showSubmitConfirmation}>
            <button type="button" onClick={goBack} disabled={activeStep === 0} className="portal-btn-secondary min-h-11 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50">
              Back
            </button>
            {/* Distinct keys matter here. Without them React reuses one DOM node
                and flips its type from button to submit as the last section
                gives way to the review, so the click that asked to continue
                lands on a submit and opens the confirmation straight away. */}
            {activeStep < reviewStep ? (
              <button key="brief-continue" type="button" onClick={goNext} className="portal-btn-primary min-h-11 px-4 py-2">
                Continue
              </button>
            ) : shouldShowBriefSubmitAction(Boolean(latestBrief)) ? (
              <button
                key="brief-submit"
                type="button"
                ref={submitButtonRef}
                onClick={requestSubmission}
                disabled={isSubmitting}
                className={showSubmitConfirmation ? "portal-btn-secondary min-h-11 px-4 py-2" : "portal-btn-primary min-h-11 px-4 py-2"}
              >
                {isSubmitting ? "Submitting..." : "Submit brief"}
              </button>
            ) : null}
          </BriefNavigation>


            </div>
          </div>

          {showSubmitConfirmation ? (
            <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-40 flex items-center justify-center bg-fg/40 px-4" role="dialog" aria-modal="true" aria-labelledby="brief-submit-confirm-title">
              <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl">
                <h4 id="brief-submit-confirm-title" className="text-lg font-semibold text-fg">
                  {BRIEF_SUBMISSION_CONFIRMATION_COPY.title}
                </h4>
                <p className="mt-2 text-base text-fg-2">{BRIEF_SUBMISSION_CONFIRMATION_COPY.body}</p>

                <label className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-surface p-3 text-base text-fg">
                  <input
                    type="checkbox"
                    disabled={isSubmitting}
                    checked={submissionAcknowledged}
                    onChange={(event) => setSubmissionAcknowledged(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-accent"
                  />
                  <span>{BRIEF_SUBMISSION_CONFIRMATION_COPY.checkboxLabel}</span>
                </label>

                {error ? <p className="mt-3 text-base text-danger" role="alert">{error}</p> : null}
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" disabled={isSubmitting} onClick={onCancelSubmitConfirmation} className="portal-btn-secondary px-4 py-2">
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
