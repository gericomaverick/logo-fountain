import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ link: vi.fn(), login: vi.fn(), change: vi.fn(), reset: vi.fn(), magic: vi.fn(), session: vi.fn(), signOut: vi.fn(), admin: vi.fn(), limit: vi.fn(), require: vi.fn() }));
vi.mock("@/lib/auth/service", () => ({ requestAuthLink: mocks.link, login: mocks.login, changeCredential: mocks.change, resetCredential: mocks.reset, verifyMagic: mocks.magic, sessionFromHeaders: mocks.session }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ api: { signOut: mocks.signOut } }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ consumeAuthLimit: mocks.limit }));
vi.mock("@/lib/auth/require", () => ({ requireUser: mocks.require }));
vi.mock("@/lib/auth/admin", () => ({ isAdminUser: mocks.admin }));
import { POST } from "./route";
const req = (body: unknown = {}, origin = "https://app.example.test") => new Request("https://internal.invalid/api/auth/forgot-password", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); process.env.PUBLIC_SITE_URL = "https://app.example.test"; mocks.limit.mockResolvedValue(true); mocks.signOut.mockResolvedValue(new Response("{}")); });

describe("forgot-password controlled boundary", () => {
  it("rejects hostile or missing provenance before auth work", async () => {
    expect((await POST(req({}, "https://evil.invalid"))).status).toBe(403);
    const absent = req(); absent.headers.delete("origin");
    expect((await POST(absent)).status).toBe(403);
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("returns identical generic responses for unknown accounts and delivery failure", async () => {
    const first = await POST(req({ email: "buyer@example.invalid", next: "//evil.invalid" }));
    mocks.link.mockRejectedValueOnce(new Error("secret-provider-bearer"));
    const second = await POST(req({ email: "buyer@example.invalid" }));
    expect(first.status).toBe(200); expect(await second.text()).toBe(await first.text());
  });
  it("does not send when shared limits deny", async () => {
    mocks.limit.mockResolvedValue(false);
    expect((await POST(req({ email: "buyer@example.invalid" }))).status).toBe(200);
    expect(mocks.link).not.toHaveBeenCalled();
  });
});
