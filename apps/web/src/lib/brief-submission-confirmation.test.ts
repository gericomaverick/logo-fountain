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

  it("says plainly that it cannot be changed, in the person's own terms", () => {
    const body = BRIEF_SUBMISSION_CONFIRMATION_COPY.body.toLowerCase();
    expect(body).toContain("designer");
    // The finality has to be stated, but as what happens to them rather than as
    // a record being locked against a "client".
    expect(body).toMatch(/won.t be able to change|cannot change|can.t change/);
    expect(BRIEF_SUBMISSION_CONFIRMATION_COPY.checkboxLabel.toLowerCase()).toContain("ready to send");
  });

  it("never calls the person a client or talks about locking", () => {
    const all = Object.values(BRIEF_SUBMISSION_CONFIRMATION_COPY).join(" ").toLowerCase();
    expect(all).not.toContain("client");
    expect(all).not.toContain("lock");
  });
});
