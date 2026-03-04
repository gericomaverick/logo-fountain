export function applyMagicLinkRedirectOverride(actionLink: string, callbackUrl: string): string {
  if (!actionLink || !callbackUrl) return actionLink;

  try {
    const supabaseUrl = new URL(actionLink);
    const tokenHash = supabaseUrl.searchParams.get("token_hash") ?? supabaseUrl.searchParams.get("token");
    const otpType = supabaseUrl.searchParams.get("type");

    if (tokenHash && otpType) {
      const callback = new URL(callbackUrl);
      callback.searchParams.set("token", tokenHash);
      callback.searchParams.set("type", otpType);
      return callback.toString();
    }

    supabaseUrl.searchParams.set("redirect_to", callbackUrl);
    return supabaseUrl.toString();
  } catch {
    return actionLink;
  }
}
