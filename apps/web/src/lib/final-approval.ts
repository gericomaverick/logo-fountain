export const FINAL_APPROVAL_CONFIRMATION_COPY = {
  title: "Ready to lock this in?",
  body: "Once you approve this concept, it becomes your final chosen direction and we’ll move straight into final file delivery. This step is final.",
  checkboxLabel: "I understand this approval is final and I want to continue.",
  confirmLabel: "Yes, approve this concept",
  cancelLabel: "Not yet",
};

export function canConfirmFinalApproval(acknowledged: boolean): boolean {
  return acknowledged;
}
