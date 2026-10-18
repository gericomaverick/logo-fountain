/**
 * The four things that happen to a logo project, in the customer's words rather
 * than the state machine's. A new customer has just paid and has no idea what
 * comes next; showing the whole arc, with where they are on it, answers that
 * before they have to ask.
 */

export type JourneyStepState = "done" | "current" | "upcoming";

export type JourneyStep = {
  id: "brief" | "concepts" | "revisions" | "delivery";
  title: string;
  description: string;
  state: JourneyStepState;
};

const STEPS: Array<Omit<JourneyStep, "state">> = [
  { id: "brief", title: "Tell us about your brand", description: "A few questions so your designer knows what they are designing for." },
  { id: "concepts", title: "We design your concepts", description: "Your designer works from the brief and sends concepts to review." },
  { id: "revisions", title: "You give feedback", description: "Tell us what to change. We refine until it is right." },
  { id: "delivery", title: "Your final files arrive", description: "Every format you need, ready to use everywhere." },
];

/** Which step a project status sits on. Unknown statuses rest at the start. */
const STEP_INDEX_BY_STATUS: Record<string, number> = {
  AWAITING_BRIEF: 0,
  BRIEF_SUBMITTED: 1,
  IN_DESIGN: 1,
  CONCEPTS_READY: 2,
  REVISIONS_IN_PROGRESS: 2,
  AWAITING_APPROVAL: 2,
  APPROVED: 3,
  FINAL_FILES_READY: 3,
  DELIVERED: 3,
};

export function getProjectJourney(status: string | null | undefined): JourneyStep[] {
  const activeIndex = STEP_INDEX_BY_STATUS[status ?? ""] ?? 0;
  const complete = status === "DELIVERED";

  return STEPS.map((step, index) => ({
    ...step,
    state: complete || index < activeIndex ? "done" : index === activeIndex ? "current" : "upcoming",
  }));
}

/**
 * The welcome belongs to someone who has paid and not yet told us anything. Once
 * a brief exists, the hub's ordinary next-step card takes over.
 */
export function shouldShowProjectWelcome(status: string | null | undefined, hasSubmittedBrief: boolean): boolean {
  return status === "AWAITING_BRIEF" && !hasSubmittedBrief;
}
