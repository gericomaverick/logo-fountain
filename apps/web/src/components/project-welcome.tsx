import Link from "next/link";

import { getProjectJourney, type JourneyStep } from "@/lib/project-journey";

import { CheckIcon, ChevronRightIcon } from "./icons";

/**
 * What a customer sees on a project they have paid for and not yet briefed.
 *
 * One filled block of brand colour carries the only thing they have to do, so
 * there is never a question of where to look first. Everything else — how the
 * project will run — sits quietly underneath it, and the facts about their
 * package stay in the properties column where the page already keeps facts.
 */
export function ProjectWelcome({
  projectId,
  status,
  firstName,
  hasDraft,
}: {
  projectId: string;
  status: string | null | undefined;
  firstName: string | null;
  hasDraft: boolean;
}) {
  const steps = getProjectJourney(status);

  return (
    <section className="space-y-8">
      <div className="rounded-xl bg-brand-block p-6 sm:p-8">
        <h2 className="max-w-[22ch] text-2xl font-semibold tracking-tight text-brand-block-fg sm:text-3xl">
          {firstName ? `${firstName}, let’s get your logo started` : "Let’s get your logo started"}
        </h2>
        <p className="mt-3 max-w-[52ch] text-base text-brand-block-fg-2">
          {hasDraft
            ? "Your answers are saved — carry on where you stopped."
            : "Tell your designer about your brand. It takes about five minutes, and you can stop and come back whenever you like."}
        </p>
        <Link
          href={`/project/${projectId}/brief`}
          className="mt-6 inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-[var(--brand-block-fg)] px-5 text-base font-semibold text-[var(--brand-block-btn-fg)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-block-fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-block)]"
        >
          {hasDraft ? "Continue your brief" : "Start your brief"}
          <ChevronRightIcon size={16} />
        </Link>
      </div>

      <div>
        <h3 className="text-lg font-semibold tracking-tight text-fg">How your project will run</h3>
        <ol className="mt-4 space-y-4">
          {steps.map((step, index) => (
            <JourneyRow key={step.id} step={step} index={index} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function JourneyRow({ step, index }: { step: JourneyStep; index: number }) {
  const isCurrent = step.state === "current";
  const isDone = step.state === "done";

  return (
    <li className="flex gap-4">
      <span
        aria-hidden
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
          isDone
            ? "bg-success-soft text-success"
            : isCurrent
              ? "bg-accent text-[var(--accent-fg)]"
              : "bg-surface-2 text-fg-3"
        }`}
      >
        {isDone ? <CheckIcon size={14} /> : index + 1}
      </span>
      <div className="min-w-0">
        <p className={`text-base ${isCurrent ? "font-semibold text-fg" : "text-fg-2"}`}>
          {step.title}
          {isCurrent ? <span className="ml-2 text-sm font-normal text-accent">You are here</span> : null}
        </p>
        <p className="mt-0.5 text-sm text-fg-3">{step.description}</p>
      </div>
    </li>
  );
}
