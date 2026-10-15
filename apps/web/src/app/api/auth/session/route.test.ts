import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ link: vi.fn(), login: vi.fn(), change: vi.fn(), reset: vi.fn(), magic: vi.fn(), session: vi.fn(), signOut: vi.fn(), admin: vi.fn(), limit: vi.fn(), require: vi.fn() }));
vi.mock("@/lib/auth/service", () => ({ requestAuthLink: mocks.link, login: mocks.login, changeCredential: mocks.change, resetCredential: mocks.reset, verifyMagic: mocks.magic, sessionFromHeaders: mocks.session }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ api: { signOut: mocks.signOut } }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ consumeAuthLimit: mocks.limit }));
vi.mock("@/lib/auth/require", () => ({ requireUser: mocks.require }));
vi.mock("@/lib/auth/admin", () => ({ isAdminUser: mocks.admin }));
import { GET } from "./route";
const request = new Request("https://app.example.test/api/auth/session");
beforeEach(() => { vi.resetAllMocks(); });
describe("DB-backed session verification", () => {
  it("reports verified absence, not a provider guess", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(request);
    expect(await response.json()).toEqual({ authenticated: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("fails closed on database outage without claiming verified logout", async () => {
    mocks.session.mockRejectedValue(new Error("secret-db-uri"));
    const response = await GET(request);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-db-uri");
  });
  it("returns only a minimal verified identity and DB admin flag", async () => {
    mocks.session.mockResolvedValue({ user: { id: "uuid", email: "verified@example.invalid", emailVerified: true }, session: { token: "secret-token" } });
    mocks.admin.mockResolvedValue(false);
    expect(await (await GET(request)).json()).toEqual({ authenticated: true, userId: "uuid", email: "verified@example.invalid", isAdmin: false });
  });
});
