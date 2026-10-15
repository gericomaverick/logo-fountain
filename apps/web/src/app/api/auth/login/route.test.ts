import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ link: vi.fn(), login: vi.fn(), change: vi.fn(), reset: vi.fn(), magic: vi.fn(), session: vi.fn(), signOut: vi.fn(), admin: vi.fn(), limit: vi.fn(), require: vi.fn() }));
vi.mock("@/lib/auth/service", () => ({ requestAuthLink: mocks.link, login: mocks.login, changeCredential: mocks.change, resetCredential: mocks.reset, verifyMagic: mocks.magic, sessionFromHeaders: mocks.session }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ api: { signOut: mocks.signOut } }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ reserveLoginAttempt: mocks.limit, clearLoginFailures: mocks.admin }));
vi.mock("@/lib/auth/require", () => ({ requireUser: mocks.require }));
vi.mock("@/lib/auth/admin", () => ({ isAdminUser: mocks.admin }));
import { POST } from "./route";
const req = (body: unknown = {}, origin = "https://app.example.test") => new Request("https://internal.invalid/api/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); delete process.env.AUTH_TRUSTED_PROXY_HOPS; delete process.env.AUTH_CLIENT_IP_HEADER; process.env.PUBLIC_SITE_URL = "https://app.example.test"; mocks.limit.mockResolvedValue(true); mocks.signOut.mockResolvedValue(new Response("{}")); });

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
