export const BRIEF_SUBMISSION_CONFIRMATION_COPY = {
  title: "Ready to submit your brief?",
  body: "You’ve done the hard part — nice work. This submission guides your designer’s next steps. Once you confirm, your brief is locked for client editing, so take a final moment to review everything.",
  checkboxLabel: "I’ve reviewed my answers and understand this brief will be locked after I submit.",
  confirmLabel: "Yes, submit my brief",
  cancelLabel: "Go back and review",
};

export type BriefSubmissionConfirmationState = {
  isLocked: boolean;
  isDialogOpen: boolean;
  isAcknowledged: boolean;
};

export function createBriefSubmissionConfirmationState(isLocked: boolean): BriefSubmissionConfirmationState {
  return {
    isLocked,
    isDialogOpen: false,
    isAcknowledged: false,
  };
}

export function openBriefSubmissionConfirmation(state: BriefSubmissionConfirmationState): BriefSubmissionConfirmationState {
  if (state.isLocked) return state;
  return { ...state, isDialogOpen: true };
}

export function cancelBriefSubmissionConfirmation(state: BriefSubmissionConfirmationState): BriefSubmissionConfirmationState {
  return { ...state, isDialogOpen: false, isAcknowledged: false };
}

export function setBriefSubmissionAcknowledged(
  state: BriefSubmissionConfirmationState,
  acknowledged: boolean,
): BriefSubmissionConfirmationState {
  return { ...state, isAcknowledged: acknowledged };
}

export function canConfirmBriefSubmission(acknowledged: boolean): boolean {
  return acknowledged;
}

export function shouldShowBriefSubmitAction(isLocked: boolean): boolean {
  return !isLocked;
}

export function shouldPerformBriefSubmission(state: BriefSubmissionConfirmationState): boolean {
  if (state.isLocked) return false;
  if (!state.isDialogOpen) return false;
  return canConfirmBriefSubmission(state.isAcknowledged);
}
