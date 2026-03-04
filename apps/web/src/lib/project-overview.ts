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
