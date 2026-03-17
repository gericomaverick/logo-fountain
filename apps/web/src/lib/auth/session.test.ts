import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureBrowserSupabaseSession } from "./session";

type SessionShape = { id: string } | null;

const testGlobals = globalThis as unknown as {
  window?: Window;
  document?: Document;
};

function createSupabaseMock(options?: {
  session?: SessionShape;
  getSessionError?: string;
  exchangeError?: string;
  setSessionError?: string;
}) {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: options?.session ?? null },
    error: options?.getSessionError ? { message: options.getSessionError } : null,
  });

  const exchangeCodeForSession = vi.fn().mockResolvedValue({
    error: options?.exchangeError ? { message: options.exchangeError } : null,
  });

  const setSession = vi.fn().mockResolvedValue({
    error: options?.setSessionError ? { message: options.setSessionError } : null,
  });

  const signOut = vi.fn().mockResolvedValue({ error: null });

  return {
    auth: {
      getSession,
      exchangeCodeForSession,
      setSession,
      signOut,
    },
  };
}

function asBrowserClient(client: ReturnType<typeof createSupabaseMock>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

function mockWindow(href: string) {
  const url = new URL(href);
  const replaceState = vi.fn();

  testGlobals.window = {
    location: {
      href: url.href,
      hash: url.hash,
      search: url.search,
      pathname: url.pathname,
    },
    history: {
      replaceState,
    },
  } as unknown as Window;

  return replaceState;
}

describe("ensureBrowserSupabaseSession", () => {
  beforeEach(() => {
    testGlobals.document = { title: "Test" } as unknown as Document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete testGlobals.window;
    delete testGlobals.document;
  });

  it("returns the existing session without touching the URL", async () => {
    mockWindow("https://example.com/set-password");
    const supabase = createSupabaseMock({ session: { id: "123" } });

    const result = await ensureBrowserSupabaseSession(asBrowserClient(supabase));

    expect(result).toEqual({ status: "signed-in", source: "existing" });
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("exchanges the code in the query string and strips Supabase params", async () => {
    const replaceState = mockWindow("https://example.com/set-password?code=123&state=abc&next=/dashboard");
    const supabase = createSupabaseMock();

    const result = await ensureBrowserSupabaseSession(asBrowserClient(supabase));

    expect(result).toEqual({ status: "signed-in", source: "code" });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("123");
    expect(replaceState).toHaveBeenCalledWith({}, "Test", "/set-password?next=%2Fdashboard");
  });

  it("prefers exchanging callback code even if another session already exists", async () => {
    const replaceState = mockWindow("https://example.com/project/p2?code=fresh-code&state=s1");
    const supabase = createSupabaseMock({ session: { id: "stale-session" } });

    const result = await ensureBrowserSupabaseSession(asBrowserClient(supabase));

    expect(result).toEqual({ status: "signed-in", source: "code" });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("fresh-code");
    expect(replaceState).toHaveBeenCalledWith({}, "Test", "/project/p2");
  });

  it("hydrates the session from hash tokens", async () => {
    const replaceState = mockWindow("https://example.com/set-password#access_token=abc&refresh_token=def");
    const supabase = createSupabaseMock();

    const result = await ensureBrowserSupabaseSession(asBrowserClient(supabase));

    expect(result).toEqual({ status: "signed-in", source: "hash" });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: "abc", refresh_token: "def" });
    expect(replaceState).toHaveBeenCalledWith({}, "Test", "/set-password");
  });

  it("reports missing tokens when nothing can create a session", async () => {
    mockWindow("https://example.com/set-password?next=/dashboard");
    const supabase = createSupabaseMock();

    const result = await ensureBrowserSupabaseSession(asBrowserClient(supabase));
    expect(result).toEqual({ status: "missing" });
  });

  it("propagates Supabase errors", async () => {
    mockWindow("https://example.com/set-password?code=123");
    const supabase = createSupabaseMock({ exchangeError: "boom" });

    const result = await ensureBrowserSupabaseSession(asBrowserClient(supabase));

    expect(result).toEqual({ status: "error", message: "boom" });
  });
});
