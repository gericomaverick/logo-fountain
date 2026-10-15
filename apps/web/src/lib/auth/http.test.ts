import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./rate-limit", () => ({ consumeAuthLimit: vi.fn() }));
import { authMutation, authJson } from "./http";
beforeEach(() => { process.env.PUBLIC_SITE_URL = "https://app.example.test"; });
describe("controlled auth mutation wrapper", () => {
  it.each(["https://evil.invalid", "null", ""])("rejects provenance %s before reading JSON or invoking work", async (origin) => {
    const work = vi.fn();
    const req = new Request("https://app.example.test/api/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "not-json" });
    expect((await authMutation(req, work)).status).toBe(403); expect(work).not.toHaveBeenCalled();
  });
  it("rejects malformed, oversized or simple-content-type bodies before work", async () => {
    const work = vi.fn();
    for (const [type, body, status] of [["text/plain", "{}", 400], ["application/json", "{", 400], ["application/json", '"' + "a".repeat(9000) + '"', 413]] as const) {
      const req = new Request("https://app.example.test/api/auth/login", { method: "POST", headers: { origin: "https://app.example.test", "content-type": type }, body });
      expect((await authMutation(req, work)).status).toBe(status);
    }
    expect(work).not.toHaveBeenCalled();
  });
  it("accepts canonical Referer provenance when Origin is absent, without forwarding diagnostics", async () => {
    const req = new Request("https://app.example.test/api/auth/login", { method: "POST", headers: { referer: "https://app.example.test/login", "content-type": "application/json" }, body: "{}" });
    expect((await authMutation(req, async () => authJson({ ok: true }))).status).toBe(200);
  });
});
