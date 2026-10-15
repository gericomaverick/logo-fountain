type Limit = { unlimited?: boolean; limit?: number | null };

// Poll callbacks must consult current dirty flags after awaiting the snapshot,
// not flags captured by the interval's initial render. Preserve each field alone.
export function refreshOverrideInputs(
  dirty: { current: { concepts: boolean; revisions: boolean } },
  usage: { concepts?: Limit; revisions?: Limit } | undefined,
  setConcepts: (value: string) => void,
  setRevisions: (value: string) => void,
) {
  const value = (limit?: Limit) => limit?.unlimited ? "" : String(limit?.limit ?? "");
  if (!dirty.current.concepts) setConcepts(value(usage?.concepts));
  if (!dirty.current.revisions) setRevisions(value(usage?.revisions));
}
