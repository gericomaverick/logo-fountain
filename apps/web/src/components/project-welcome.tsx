import Link from "next/link";

import { getProjectJourney, type JourneyStep } from "@/lib/project-journey";

import { CheckIcon, ChevronRightIcon } from "./icons";
import { Section } from "./ui";

/**
 * The one thing a customer who has paid and not yet briefed has to do.
 *
 * It is the only filled block of brand colour on the page, so there is never a
 * question of where to look first — which is why the stage block below it is
 * the quiet journey rather than the purple timeline: at this point the two said
 * the same thing twice, and the louder one was not the one with the button.
 */
export function ProjectWelcome({
  projectId,
  firstName,
  hasDraft,
}: {
  projectId: string;
  firstName: string | null;
  hasDraft: boolean;
}) {
  return (
    <section className="brand-sheen rounded-xl bg-brand-block p-6 sm:p-8">
      <h2 className="portal-display max-w-[22ch] text-xl text-brand-block-fg sm:text-2xl">
        {firstName ? `Hey, ${firstName} — let’s get your logo started` : "Let’s get your logo started"}
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
    </section>
  );
}

/**
 * The whole arc of the project, with where they are on it.
 *
 * This holds the same slot the stage timeline holds once a brief exists, and
 * wears the same quiet frame, so the page keeps one shape as the project moves
 * rather than rearranging itself. The steps are joined by a line because four
 * numbered discs floating on a page do not read as a sequence.
 */
export function ProjectJourney({ status }: { status: string | null | undefined }) {
  const steps = getProjectJourney(status);

  return (
    <Section title="How your project will run">
      <ol className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        {steps.map((step, index) => (
          <JourneyRow key={step.id} step={step} index={index} isLast={index === steps.length - 1} />
        ))}
      </ol>
    </Section>
  );
}

function JourneyRow({ step, index, isLast }: { step: JourneyStep; index: number; isLast: boolean }) {
  const isCurrent = step.state === "current";
  const isDone = step.state === "done";

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* Joins this step to the next, from under the disc. Purple once passed. */}
      {isLast ? null : (
        <span
          aria-hidden
          className={`absolute bottom-0 left-4 top-9 w-[2px] -translate-x-1/2 rounded-full ${isDone ? "bg-accent" : "bg-line-strong"}`}
        />
      )}

      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
          isDone
            ? "bg-accent-soft text-accent"
            : isCurrent
              ? "bg-accent text-[var(--accent-fg)] ring-4 ring-accent-soft"
              : "border border-line-strong bg-panel text-fg-2"
        }`}
      >
        {isDone ? <CheckIcon size={16} /> : index + 1}
      </span>

      <div className="min-w-0 pt-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-base ${isCurrent ? "font-semibold text-fg" : "font-medium text-fg"}`}>{step.title}</span>
          {isCurrent ? <span className="font-mono text-xs font-medium tracking-[0.02em] text-accent">You are here</span> : null}
        </p>
        <p className="mt-1 max-w-[56ch] text-sm text-fg-2">{step.description}</p>
      </div>
    </li>
  );
}
