import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RouteAuthError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    RouteAuthError,
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    accountsRetrieve: vi.fn(),
    listBuckets: vi.fn(),
    prisma: {
      $queryRaw: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth/require", () => ({
  RouteAuthError: mocks.RouteAuthError,
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: (error: unknown) => {
    if (error instanceof mocks.RouteAuthError) {
      return Response.json({ error: { message: error.message, code: error.code } }, { status: error.status });
    }
    throw error;
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/stripe", () => ({ STRIPE_PLACEHOLDER_PRICE_IDS: [] }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: { listBuckets: mocks.listBuckets },
  }),
}));
vi.mock("stripe", () => ({
  default: class StripeMock {
    accounts = { retrieve: mocks.accountsRetrieve };
  },
}));

import { GET } from "./route";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "POSTMARK_SERVER_TOKEN",
  "POSTMARK_FROM",
  "PUBLIC_SITE_URL",
  "ADMIN_EMAILS",
] as const;

const originalEnv: Record<string, string | undefined> = {};

describe("GET /api/admin/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mocks.accountsRetrieve.mockResolvedValue({ id: "acct_123" });
    mocks.listBuckets.mockResolvedValue({
      data: [{ name: "concepts" }, { name: "final-deliverables" }],
      error: null,
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("returns 401 for unauthenticated callers", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users so env details never leak", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.checks).toBeUndefined();
  });

  it("reports ok when all env vars, db, stripe, and buckets are healthy", async () => {
    for (const key of ENV_KEYS) {
      process.env[key] = "test-value";
    }
    process.env.PUBLIC_SITE_URL = "https://example.com";

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.failed).toBe(0);
  });

  it("requires a canonical HTTPS public origin in production", async () => {
    for (const key of ENV_KEYS) process.env[key] = "test-value";
    vi.stubEnv("NODE_ENV", "production");

    for (const invalid of ["http://example.com", "https://user:pass@example.com", "ftp://example.com", "not-a-url"]) {
      process.env.PUBLIC_SITE_URL = invalid;
      const body = await (await GET()).json();
      expect(body.checks.find((check: { key: string }) => check.key === "env:PUBLIC_SITE_URL").passed).toBe(false);
    }

    process.env.PUBLIC_SITE_URL = "https://example.com/app/path";
    const body = await (await GET()).json();
    const check = body.checks.find((item: { key: string }) => item.key === "env:PUBLIC_SITE_URL");
    expect(check.passed).toBe(true);
    expect(check.summary).toContain("https://example.com");
    vi.unstubAllEnvs();
  });

  it("flags missing env vars and unreachable dependencies", async () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);

    const byKey = new Map(body.checks.map((check: { key: string; passed: boolean }) => [check.key, check.passed]));
    expect(byKey.get("env:STRIPE_SECRET_KEY")).toBe(false);
    expect(byKey.get("env:POSTMARK_SERVER_TOKEN")).toBe(false);
    expect(byKey.get("env:POSTMARK_FROM")).toBe(false);
    expect(byKey.get("env:PUBLIC_SITE_URL")).toBe(false);
    expect(byKey.get("db:connectivity")).toBe(false);
    expect(byKey.get("stripe:connectivity")).toBe(false);
    expect(byKey.get("supabase:bucket:concepts")).toBe(false);
  });
});
