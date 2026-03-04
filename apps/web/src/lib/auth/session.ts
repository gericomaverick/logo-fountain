import type { SupabaseClient } from "@supabase/supabase-js";

export type EnsureSessionResult =
  | { status: "signed-in"; source: "existing" | "code" | "hash" }
  | { status: "missing" }
  | { status: "error"; message: string };

function replaceUrl(pathAndSearch: string) {
  if (typeof window === "undefined") return;
  const title = typeof document !== "undefined" ? document.title : "";
  if (typeof window.history?.replaceState === "function") {
    window.history.replaceState({}, title, pathAndSearch);
  }
}

function stripQueryParams(url: URL, params: string[]) {
  params.forEach((param) => url.searchParams.delete(param));
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}`;
}

export async function ensureBrowserSupabaseSession(supabase: SupabaseClient): Promise<EnsureSessionResult> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return { status: "error", message: error.message };
  }

  if (data.session) {
    return { status: "signed-in", source: "existing" };
  }

  if (typeof window === "undefined") {
    return { status: "missing" };
  }

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return { status: "error", message: exchangeError.message };
    }

    const cleaned = stripQueryParams(url, ["code", "state"]);
    replaceUrl(cleaned + window.location.hash);
    return { status: "signed-in", source: "code" };
  }

  const hash = window.location.hash;
  if (hash && hash.length > 1) {
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setSessionError) {
        return { status: "error", message: setSessionError.message };
      }

      replaceUrl(`${url.pathname}${url.search}`);
      return { status: "signed-in", source: "hash" };
    }
  }

  return { status: "missing" };
}
