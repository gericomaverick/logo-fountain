import { EMPTY_BRIEF_ANSWERS, normalizeBriefAnswers, type BriefAnswers } from "./brief";

const DRAFT_STORAGE_PREFIX = "logo-fountain:brief-draft";

export function briefDraftStorageKey(projectId: string, latestBriefVersion: number | null): string {
  return `${DRAFT_STORAGE_PREFIX}:${projectId}:v${latestBriefVersion ?? 0}`;
}

export function parseBriefDraft(raw: string | null): BriefAnswers | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeBriefAnswers(parsed);
  } catch {
    return null;
  }
}

export function mergeWithBriefDefaults(value: BriefAnswers | null): BriefAnswers {
  if (!value) return EMPTY_BRIEF_ANSWERS;
  return { ...EMPTY_BRIEF_ANSWERS, ...value };
}

export function hasBriefAnswerChanges(current: BriefAnswers, baseline: BriefAnswers): boolean {
  const currentNormalized = mergeWithBriefDefaults(current);
  const baselineNormalized = mergeWithBriefDefaults(baseline);

  return (Object.keys(currentNormalized) as Array<keyof BriefAnswers>).some(
    (key) => currentNormalized[key] !== baselineNormalized[key],
  );
}
