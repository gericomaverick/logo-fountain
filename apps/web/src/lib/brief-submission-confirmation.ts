export const BRIEF_SUBMISSION_CONFIRMATION_COPY = {
  title: "Ready to send this to your designer?",
  body: "You’ve done the hard part — nice work. This is what your designer will work from, so take a last look: you won’t be able to change it once it’s sent. If something needs correcting later, message your designer and they’ll pick it up.",
  checkboxLabel: "I’ve reviewed my answers and I’m ready to send this to my designer.",
  confirmLabel: "Yes, send my brief",
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
