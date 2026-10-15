/** Only report success after sign-out succeeds and the cookie session is gone. */
export async function logoutAndVerifySession(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Could not sign out. Please retry.");
  const result = await response.json();
  if (result?.ok !== true) throw new Error("Could not confirm sign-out. Please retry.");

  const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
  if (!sessionResponse.ok) throw new Error("Could not confirm sign-out. Please retry.");
  const session = await sessionResponse.json();
  if (session?.authenticated !== false) throw new Error("Your session may still be active. Please retry signing out.");
}
