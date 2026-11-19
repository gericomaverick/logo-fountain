// Brief and project-thread page-object interfaces (story 0.8b). Implementations: pages/next/brief.ts, pages/laravel/areas-0-8b.ts.
// Behaviour only (DV-UX): both the Next wizard and the redesigned Laravel one (ux-design.md §7 "Your turn: brief",
// J2) have sections, autosave with a visible saved state, a review and a confirmation dialog with a checkbox.

/** Brief answer keys: the shared brief contract (apps/web/src/lib/brief.ts; the Laravel validator mirrors it). */
export type BriefFieldKey =
  | "brandName" | "tagline" | "industry" | "offerSummary"
  | "audiencePrimary" | "audienceSecondary" | "businessGoals"
  | "brandPersonality" | "styleDirection" | "colorPreferences" | "mustInclude" | "avoidanceNotes"
  | "usageContexts" | "deliverablesContext" | "competitors" | "additionalNotes";

/**
 * Answers by key, as stored. A choice question (brandPersonality, styleDirection, colorPreferences, usageContexts)
 * takes its offered options joined by ", " in the order offered (e.g. "Bold, Approachable"): the page object picks them.
 */
export type BriefAnswers = Partial<Record<BriefFieldKey, string>>;

export interface BriefPages {
  /** Opens the brief of the open project from the project. Resolves once the wizard can be used. */
  open(): Promise<void>;
  /** Answers questions on the CURRENT section of the wizard. */
  fill(answers: BriefAnswers): Promise<void>;
  /** Moves on to the next section (or the review after the last one). Throws if the wizard refuses. */
  next(): Promise<void>;
  /** Waits until the screen says what is shown is saved to the account (the autosave), not only kept on this device. */
  waitUntilSaved(timeoutMs?: number): Promise<void>;
  /** What the wizard currently shows for `keys` (all on the current section), in the same format as `fill`. */
  shownAnswers(keys: BriefFieldKey[]): Promise<BriefAnswers>;
  /** Reloads the screen as a person would, confirming any "leave this page?" warning. Resolves once usable again. */
  reload(): Promise<void>;
  /** From the review: submit, tick the acknowledgement in the confirmation dialog, confirm. Resolves once the app says it was received. */
  submit(): Promise<void>;
}

export interface ProjectThreadPages {
  /** Opens the open project's conversation with the designer and returns the system notices shown in it, oldest first (body text only). */
  systemMessages(): Promise<string[]>;
}
