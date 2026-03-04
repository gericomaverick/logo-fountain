export function applyMagicLinkRedirectOverride(actionLink: string, redirectTo: string): string {
  if (!actionLink) return actionLink;

  try {
    const url = new URL(actionLink);
    if (redirectTo) {
      url.searchParams.set("redirect_to", redirectTo);
    }
    return url.toString();
  } catch {
    return actionLink;
  }
}
