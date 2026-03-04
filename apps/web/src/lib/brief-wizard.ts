import { briefSections, missingRequiredFields, type BriefAnswers } from "./brief";

export const REVIEW_STEP_INDEX = briefSections.length;

export function canAdvanceFromStep(answers: BriefAnswers, stepIndex: number): { ok: true } | { ok: false; missing: Array<keyof BriefAnswers> } {
  const section = briefSections[stepIndex];
  if (!section) return { ok: true };

  const missing = missingRequiredFields(answers, section);
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}

export function nextStepIndex(currentStep: number, answers: BriefAnswers): number {
  const gate = canAdvanceFromStep(answers, currentStep);
  if (!gate.ok) return currentStep;
  return Math.min(currentStep + 1, REVIEW_STEP_INDEX);
}

export function previousStepIndex(currentStep: number): number {
  return Math.max(currentStep - 1, 0);
}
