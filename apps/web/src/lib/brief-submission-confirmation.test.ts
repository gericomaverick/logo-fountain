import { describe, expect, it } from "vitest";

import {
  BRIEF_SUBMISSION_CONFIRMATION_COPY,
  cancelBriefSubmissionConfirmation,
  canConfirmBriefSubmission,
  createBriefSubmissionConfirmationState,
  openBriefSubmissionConfirmation,
  setBriefSubmissionAcknowledged,
  shouldPerformBriefSubmission,
  shouldShowBriefSubmitAction,
} from "@/lib/brief-submission-confirmation";

describe("brief submission confirmation", () => {
  it("opens confirmation modal on submit intent", () => {
    const initial = createBriefSubmissionConfirmationState(false);
    const next = openBriefSubmissionConfirmation(initial);

    expect(next.isDialogOpen).toBe(true);
  });

  it("requires explicit acknowledgment before submit request can proceed", () => {
    let state = createBriefSubmissionConfirmationState(false);
    state = openBriefSubmissionConfirmation(state);

    expect(canConfirmBriefSubmission(false)).toBe(false);
    expect(shouldPerformBriefSubmission(state)).toBe(false);

    state = setBriefSubmissionAcknowledged(state, true);

    expect(canConfirmBriefSubmission(true)).toBe(true);
    expect(shouldPerformBriefSubmission(state)).toBe(true);
  });

  it("cancel closes modal and keeps form editable state", () => {
    let state = createBriefSubmissionConfirmationState(false);
    state = setBriefSubmissionAcknowledged(openBriefSubmissionConfirmation(state), true);

    const cancelled = cancelBriefSubmissionConfirmation(state);

    expect(cancelled.isDialogOpen).toBe(false);
    expect(cancelled.isAcknowledged).toBe(false);
    expect(shouldShowBriefSubmitAction(cancelled.isLocked)).toBe(true);
  });

  it("does not expose submit action when brief is already locked", () => {
    const locked = createBriefSubmissionConfirmationState(true);

    expect(shouldShowBriefSubmitAction(locked.isLocked)).toBe(false);
    expect(openBriefSubmissionConfirmation(locked).isDialogOpen).toBe(false);
    expect(shouldPerformBriefSubmission({ ...locked, isDialogOpen: true, isAcknowledged: true })).toBe(false);
  });

  it("uses warm but clear finality language", () => {
    expect(BRIEF_SUBMISSION_CONFIRMATION_COPY.body.toLowerCase()).toContain("guides your designer");
    expect(BRIEF_SUBMISSION_CONFIRMATION_COPY.body.toLowerCase()).toContain("locked");
    expect(BRIEF_SUBMISSION_CONFIRMATION_COPY.checkboxLabel.toLowerCase()).toContain("locked");
  });
});
