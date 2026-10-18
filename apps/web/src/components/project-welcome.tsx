import Link from "next/link";

import { getProjectJourney, type JourneyStep } from "@/lib/project-journey";

import { CheckIcon, ChevronRightIcon } from "./icons";

/**
 * What a customer sees on a project they have paid for and not yet briefed.
 * It replaces an immediate redirect into the form: before being asked sixteen
 * questions, they get told what they bought, what happens next and how long
 * the one thing in front of them takes.
 */
export function ProjectWelcome({
  projectId,
  status,
  firstName,
  packageLabel,
  conceptCount,
  revisionCount,
  hasDraft,
}: {
  projectId: string;
  status: string | null | undefined;
  firstName: string | null;
  packageLabel: string | null;
  conceptCount: number | null;
  revisionCount: number | null;
  hasDraft: boolean;
}) {
  const steps = getProjectJourney(status);

  return (
    <section className="relative overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,var(--panel))] p-5 sm:p-6">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />

      <div className="pl-1">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-accent">
          {hasDraft ? "Pick up where you left off" : "Welcome to Logo Fountain"}
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-fg">
          {firstName ? `${firstName}, let’s get your logo started` : "Let’s get your logo started"}
        </h2>
        <p className="mt-2 max-w-[60ch] text-base text-fg-2">
          {hasDraft
            ? "Your answers are saved. Carry on where you stopped — we kept everything."
            : "Your designer needs to know a little about your brand before they can start. It takes about five minutes, and you can stop and come back whenever you like."}
        </p>

        {packageLabel || conceptCount !== null || revisionCount !== null ? (
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
            {packageLabel ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">Your package</dt>
                <dd className="mt-0.5 text-base font-medium text-fg">{packageLabel}</dd>
              </div>
            ) : null}
            {conceptCount !== null ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">Concepts included</dt>
                <dd className="mt-0.5 text-base font-medium text-fg tabular-nums">{conceptCount}</dd>
              </div>
            ) : null}
            {revisionCount !== null ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">Revisions included</dt>
                <dd className="mt-0.5 text-base font-medium text-fg tabular-nums">{revisionCount}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <ol className="mt-6 space-y-3">
          {steps.map((step, index) => (
            <JourneyRow key={step.id} step={step} index={index} />
          ))}
        </ol>

        <Link href={`/project/${projectId}/brief`} className="portal-btn-primary mt-6 h-11 px-5 text-base">
          {hasDraft ? "Continue your brief" : "Start your brief"}
          <ChevronRightIcon size={16} />
        </Link>
        <p className="mt-3 text-sm text-fg-3">
          Nothing is sent to your designer until you review everything and submit.
        </p>
      </div>
    </section>
  );
}

function JourneyRow({ step, index }: { step: JourneyStep; index: number }) {
  const isCurrent = step.state === "current";
  const isDone = step.state === "done";

  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
          isDone
            ? "bg-success-soft text-success"
            : isCurrent
              ? "bg-accent text-[var(--accent-fg)]"
              : "bg-surface-2 text-fg-3"
        }`}
      >
        {isDone ? <CheckIcon size={12} /> : index + 1}
      </span>
      <div className="min-w-0">
        <p className={`text-base ${isCurrent ? "font-semibold text-fg" : "text-fg-2"}`}>
          {step.title}
          {isCurrent ? <span className="ml-2 text-sm font-normal text-accent">You are here</span> : null}
        </p>
        <p className="text-sm text-fg-3">{step.description}</p>
      </div>
    </li>
  );
}
