import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ link: vi.fn(), login: vi.fn(), change: vi.fn(), reset: vi.fn(), magic: vi.fn(), session: vi.fn(), signOut: vi.fn(), admin: vi.fn(), limit: vi.fn(), require: vi.fn() }));
vi.mock("@/lib/auth/service", () => ({ requestAuthLink: mocks.link, login: mocks.login, changeCredential: mocks.change, resetCredential: mocks.reset, verifyMagic: mocks.magic, sessionFromHeaders: mocks.session }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ api: { signOut: mocks.signOut } }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ reserveLoginAttempt: mocks.limit, clearLoginFailures: mocks.admin }));
vi.mock("@/lib/auth/require", () => ({ requireUser: mocks.require }));
vi.mock("@/lib/auth/admin", () => ({ isAdminUser: mocks.admin }));
import { POST } from "./route";
const req = (body: unknown = {}, origin = "https://app.example.test") => new Request("https://internal.invalid/api/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); delete process.env.AUTH_TRUSTED_PROXY_HOPS; delete process.env.AUTH_CLIENT_IP_HEADER; process.env.PUBLIC_SITE_URL = "https://app.example.test"; mocks.limit.mockResolvedValue(true); mocks.signOut.mockResolvedValue(new Response("{}")); });
afterEach(() => { vi.unstubAllEnvs(); delete process.env.AUTH_TRUSTED_PROXY_HOPS; delete process.env.AUTH_CLIENT_IP_HEADER; });

describe("login controlled boundary", () => {
  it("rejects hostile or missing provenance before auth work", async () => {
    expect((await POST(req({}, "https://evil.invalid"))).status).toBe(403);
    const absent = req(); absent.headers.delete("origin");
    expect((await POST(absent)).status).toBe(403);
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("does not expose native bodies or bearer tokens", async () => {
    mocks.login.mockResolvedValue(new Response('{"token":"secret-provider-bearer"}', { headers: { "set-cookie": "session=opaque; HttpOnly" } }));
    const response = await POST(req({email: "buyer@example.invalid", password: "New-password-2"}));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("secret-provider-bearer");
  });
  it("sanitizes native failure and sends no success cookie", async () => {
    mocks.login.mockRejectedValue(new Error("secret-provider-bearer"));
    const response = await POST(req({email: "buyer@example.invalid", password: "New-password-2"}));
    expect(response.status).toBe(400); expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).not.toContain("secret-provider-bearer");
  });
  it("success clears this email's failure budget; failure keeps it spent", async () => {
    mocks.login.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect((await POST(req({ email: "Buyer@Example.invalid", password: "Right-password-1" }))).status).toBe(200);
    expect(mocks.admin).toHaveBeenCalledWith(null, "buyer@example.invalid");
    mocks.admin.mockClear();
    mocks.login.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    expect((await POST(req({ email: "buyer@example.invalid", password: "Wrong-password-1" }))).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("limited attempts skip the password check and look identical to a wrong password", async () => {
    mocks.login.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    const wrong = await POST(req({ email: "buyer@example.invalid", password: "Wrong-password-1" }));
    mocks.limit.mockResolvedValueOnce(false);
    const limited = await POST(req({ email: "buyer@example.invalid", password: "Wrong-password-1" }));
    expect(limited.status).toBe(wrong.status);
    expect(await limited.text()).toBe(await wrong.text());
    expect(mocks.login).toHaveBeenCalledTimes(1);
  });
  it("production refuses login BEFORE reserving the failure bucket if proxy config or header is missing/invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const attempt = async (headers: Record<string, string> = {}) => {
      const request = req({ email: "buyer@example.invalid", password: "Wrong-password-1" });
      for (const [name, value] of Object.entries(headers)) request.headers.set(name, value);
      const response = await POST(request);
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.limit).not.toHaveBeenCalled();
      expect(mocks.login).not.toHaveBeenCalled();
    };
    await attempt({ "x-forwarded-for": "203.0.113.5" }); // no config: spoof cannot spend email budget
    process.env.AUTH_CLIENT_IP_HEADER = "x-real-ip";
    process.env.AUTH_TRUSTED_PROXY_HOPS = "1";
    await attempt({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "203.0.113.5" });
    delete process.env.AUTH_CLIENT_IP_HEADER;
    for (const value of ["0", "99x"]) { process.env.AUTH_TRUSTED_PROXY_HOPS = value; await attempt({ "x-forwarded-for": "203.0.113.5" }); }
    process.env.AUTH_TRUSTED_PROXY_HOPS = "1";
    await attempt(); // valid config, proxy failed to append
    await attempt({ "x-forwarded-for": "invalid-ip" });
    delete process.env.AUTH_TRUSTED_PROXY_HOPS;
    process.env.AUTH_CLIENT_IP_HEADER = "bad header";
    await attempt({ "x-forwarded-for": "203.0.113.5" });
    process.env.AUTH_CLIENT_IP_HEADER = "x-real-ip";
    await attempt({ "x-real-ip": "203.0.113.5, 198.51.100.7" }); // append, not overwrite
  });
  it("production accepts only a trusted hop; a spoofed leftmost entry cannot change the limiter key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.AUTH_TRUSTED_PROXY_HOPS = "1";
    mocks.login.mockResolvedValue(new Response("{}", { status: 401 }));
    for (const spoof of ["203.0.113.1", "192.0.2.9"]) {
      const request = req({ email: "buyer@example.invalid", password: "Wrong-password-1" });
      request.headers.set("x-forwarded-for", `${spoof}, 198.51.100.7`);
      expect((await POST(request)).status).toBe(400);
      expect(mocks.limit).toHaveBeenLastCalledWith("198.51.100.7", "buyer@example.invalid");
    }
  });
  it("production accepts a valid proxy-overwritten address header", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.AUTH_CLIENT_IP_HEADER = "x-real-ip";
    mocks.login.mockResolvedValue(new Response("{}", { status: 401 }));
    const request = req({ email: "buyer@example.invalid", password: "Wrong-password-1" });
    request.headers.set("x-real-ip", "198.51.100.20");
    expect((await POST(request)).status).toBe(400);
    expect(mocks.limit).toHaveBeenCalledWith("198.51.100.20", "buyer@example.invalid");
  });
  it("development still allows local sign-in without proxy config", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.login.mockResolvedValue(new Response("{}", { status: 401 }));
    expect((await POST(req({ email: "buyer@example.invalid", password: "Wrong-password-1" }))).status).toBe(400);
    expect(mocks.limit).toHaveBeenCalledWith(null, "buyer@example.invalid");
  });
  it("ignores a spoofed X-Forwarded-For without trusted-proxy config, honours it with one", async () => {
    const spoofed = () => { const r = req({ email: "buyer@example.invalid", password: "Wrong-password-1" }); r.headers.set("x-forwarded-for", "203.0.113.9, 198.51.100.7"); return r; };
    mocks.login.mockResolvedValue(new Response("{}", { status: 401 }));
    await POST(spoofed());
    expect(mocks.limit).toHaveBeenLastCalledWith(null, "buyer@example.invalid");
    process.env.AUTH_TRUSTED_PROXY_HOPS = "1";
    await POST(spoofed());
    expect(mocks.limit).toHaveBeenLastCalledWith("198.51.100.7", "buyer@example.invalid");
  });
});
