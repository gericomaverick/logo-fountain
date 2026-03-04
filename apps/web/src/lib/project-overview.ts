export function formatClientFirstName(firstName: string | null): string {
  if (!firstName) return "";
  const trimmed = firstName.trim();
  if (!trimmed) return "";
  return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
}

export function getAreaCardSubtitle(title: string, subtitle?: string): string {
  return subtitle ?? `Open ${title.toLowerCase()}`;
}
