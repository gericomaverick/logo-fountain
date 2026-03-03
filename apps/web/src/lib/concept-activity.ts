export function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function computeLatestConceptActivityAt(params: {
  conceptCreatedAt?: Date | null;
  conceptUpdatedAt?: Date | null;
  latestCommentAt?: Date | null;
}): Date | null {
  const conceptAt = maxDate(params.conceptCreatedAt ?? null, params.conceptUpdatedAt ?? null);
  return maxDate(conceptAt, params.latestCommentAt ?? null);
}
