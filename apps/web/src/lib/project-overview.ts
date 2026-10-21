export function formatClientFirstName(firstName: string | null): string {
  if (!firstName) return "";
  const trimmed = firstName.trim();
  if (!trimmed) return "";
  return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
}

export function getAreaCardSubtitle(title: string, subtitle?: string): string {
  return subtitle ?? `Open ${title.toLowerCase()}`;
}

export function getRemainingLabel(value: number, noun: string): string {
  const roundedValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${roundedValue} ${noun}${roundedValue === 1 ? "" : "s"} left`;
}

/**
 * What each of the three areas says under its name.
 *
 * "Open concepts" under a button marked Concepts told a customer nothing, which
 * is why the row read as decoration on a project with nothing in it yet. These
 * say what is actually there, so the same three buttons are worth having at
 * every stage.
 */
export function getConceptsAreaSubtitle(conceptCount: number, hasNew?: boolean): string {
  if (hasNew) return "New concepts/revisions available";
  if (conceptCount <= 0) return "Nothing to review yet";
  return `${conceptCount} concept${conceptCount === 1 ? "" : "s"} to look at`;
}

export function getMessagesAreaSubtitle(hasNew?: boolean): string {
  return hasNew ? "Unread updates waiting" : "Ask your designer anything";
}
