import { beforeEach, describe, expect, it, vi } from "vitest";
const link = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/service", () => ({ requestAuthLink: link }));
import { generateAndSendMagicLinkEmail } from "./magic-link-email";
beforeEach(() => { vi.clearAllMocks(); process.env.PUBLIC_SITE_URL="https://app.example.test"; process.env.POSTMARK_SERVER_TOKEN="test"; process.env.POSTMARK_FROM="test@example.invalid"; });
describe("trusted checkout email dispatch", () => {
  it("selects setup only from the internal trusted provisioning result and returns no bearer", async () => {
    const result = await generateAndSendMagicLinkEmail({ purchaserEmail: "buyer@example.invalid", projectId: "project-1", flow: "setup" });
    expect(link).toHaveBeenCalledWith("buyer@example.invalid", "setup", "/project/project-1", undefined);
    expect(result).toEqual({ skipped: false });
  });
  it("does not trust forwarded host and has no local-origin override", async () => {
    delete process.env.PUBLIC_SITE_URL;
    await expect(generateAndSendMagicLinkEmail({ purchaserEmail: "buyer@example.invalid", request: new Request("https://internal.invalid", { headers: { "x-forwarded-host": "evil.invalid" } }) })).rejects.toThrow();
    expect(link).not.toHaveBeenCalled();
  });
  it("fails safely when email transport is not configured", async () => {
    delete process.env.POSTMARK_SERVER_TOKEN;
    expect((await generateAndSendMagicLinkEmail({ purchaserEmail: "buyer@example.invalid" })).skipped).toBe(true);
    expect(link).not.toHaveBeenCalled();
  });
});
