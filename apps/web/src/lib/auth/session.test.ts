import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { ensureBrowserSupabaseSession } from "./session";

type SessionShape = { id: string } | null;

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

  return {
    auth: {
      getSession,
      exchangeCodeForSession,
      setSession,
    },
  };
}

function mockWindow(href: string) {
  const url = new URL(href);
  const replaceState = vi.fn();

  (globalThis as any).window = {
    location: {
      href: url.href,
      hash: url.hash,
      search: url.search,
      pathname: url.pathname,
    },
    history: {
      replaceState,
    },
  } satisfies Partial<Window> & { history: { replaceState: ReturnType<typeof vi.fn> } };

  return replaceState;
}

describe("ensureBrowserSupabaseSession", () => {
  beforeEach(() => {
    (globalThis as any).document = { title: "Test" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  it("returns the existing session without touching the URL", async () => {
    mockWindow("https://example.com/set-password");
    const supabase = createSupabaseMock({ session: { id: "123" } });

    const result = await ensureBrowserSupabaseSession(supabase as any);

    expect(result).toEqual({ status: "signed-in", source: "existing" });
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it("exchanges the code in the query string and strips Supabase params", async () => {
    const replaceState = mockWindow("https://example.com/set-password?code=123&state=abc&next=/dashboard");
    const supabase = createSupabaseMock();

    const result = await ensureBrowserSupabaseSession(supabase as any);

    expect(result).toEqual({ status: "signed-in", source: "code" });
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("123");
    expect(replaceState).toHaveBeenCalledWith({}, "Test", "/set-password?next=%2Fdashboard");
  });

  it("hydrates the session from hash tokens", async () => {
    const replaceState = mockWindow("https://example.com/set-password#access_token=abc&refresh_token=def");
    const supabase = createSupabaseMock();

    const result = await ensureBrowserSupabaseSession(supabase as any);

    expect(result).toEqual({ status: "signed-in", source: "hash" });
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: "abc", refresh_token: "def" });
    expect(replaceState).toHaveBeenCalledWith({}, "Test", "/set-password");
  });

  it("reports missing tokens when nothing can create a session", async () => {
    mockWindow("https://example.com/set-password?next=/dashboard");
    const supabase = createSupabaseMock();

    const result = await ensureBrowserSupabaseSession(supabase as any);
    expect(result).toEqual({ status: "missing" });
  });

  it("propagates Supabase errors", async () => {
    mockWindow("https://example.com/set-password?code=123");
    const supabase = createSupabaseMock({ exchangeError: "boom" });

    const result = await ensureBrowserSupabaseSession(supabase as any);

    expect(result).toEqual({ status: "error", message: "boom" });
  });
});
