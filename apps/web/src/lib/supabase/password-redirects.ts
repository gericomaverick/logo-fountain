export function buildSetPasswordRedirect(baseUrl: string, projectId?: string | null): string {
  const redirect = new URL("/set-password", baseUrl);
  redirect.searchParams.set("next", "/dashboard");
  if (projectId) redirect.searchParams.set("projectId", projectId);
  return redirect.toString();
}

export function buildAuthCallbackRedirect(
  baseUrl: string,
  options?: { projectId?: string | null; email?: string | null },
): string {
  const setPasswordUrl = new URL(buildSetPasswordRedirect(baseUrl, options?.projectId));
  const next = `${setPasswordUrl.pathname}${setPasswordUrl.search}`;

  const callback = new URL("/auth/callback", baseUrl);
  callback.searchParams.set("next", next);
  if (options?.email) {
    callback.searchParams.set("email", options.email);
  }
  return callback.toString();
}
