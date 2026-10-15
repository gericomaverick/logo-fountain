import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ link: vi.fn(), login: vi.fn(), change: vi.fn(), reset: vi.fn(), magic: vi.fn(), session: vi.fn(), signOut: vi.fn(), admin: vi.fn(), limit: vi.fn(), require: vi.fn() }));
vi.mock("@/lib/auth/service", () => ({ requestAuthLink: mocks.link, login: mocks.login, changeCredential: mocks.change, resetCredential: mocks.reset, verifyMagic: mocks.magic, sessionFromHeaders: mocks.session }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ api: { signOut: mocks.signOut } }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ consumeAuthLimit: mocks.limit }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.require }));
vi.mock("@/lib/auth/admin", () => ({ isAdminUser: mocks.admin }));
import { POST } from "./route";
const req = (body: unknown = {}, origin = "https://app.example.test") => new Request("https://internal.invalid/api/auth/password", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); process.env.PUBLIC_SITE_URL = "https://app.example.test"; mocks.limit.mockResolvedValue(true); mocks.require.mockResolvedValue({ id: "verified-user" }); mocks.signOut.mockResolvedValue(new Response("{}")); });

describe("password controlled boundary", () => {
  it("rejects hostile or missing provenance before auth work", async () => {
    expect((await POST(req({}, "https://evil.invalid"))).status).toBe(403);
    const absent = req(); absent.headers.delete("origin");
    expect((await POST(absent)).status).toBe(403);
    expect(mocks.change).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("does not expose native bodies or bearer tokens", async () => {
    mocks.change.mockResolvedValue(new Response('{"token":"secret-provider-bearer"}', { headers: { "set-cookie": "session=opaque; HttpOnly" } }));
    const response = await POST(req({currentPassword: "Old-password-1", newPassword: "New-password-2"}));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("secret-provider-bearer");
  });
  it("sanitizes native failure and sends no success cookie", async () => {
    mocks.change.mockRejectedValue(new Error("secret-provider-bearer"));
    const response = await POST(req({currentPassword: "Old-password-1", newPassword: "New-password-2"}));
    expect(response.status).toBe(400); expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).not.toContain("secret-provider-bearer");
  });
  it("returns 401 without a verified session, before rate-limit or credential work", async () => {
    mocks.require.mockResolvedValue(null);
    const response = await POST(req({ currentPassword: "Old-password-1", newPassword: "New-password-2" }));
    expect(response.status).toBe(401);
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.change).not.toHaveBeenCalled();
  });
});
