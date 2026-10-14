import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendCheckoutAuthenticationEmail: vi.fn() }));

vi.mock("@/lib/checkout-auth-email", () => ({
  sendCheckoutAuthenticationEmail: mocks.sendCheckoutAuthenticationEmail,
}));

import { POST } from "./route";

describe("POST /api/checkout/resend-magic-link", () => {
  it("uses the same guarded send implementation as the magic-link endpoint", async () => {
    const expected = Response.json({ ok: true, delivery: "email" });
    mocks.sendCheckoutAuthenticationEmail.mockResolvedValueOnce(expected);
    const req = new Request("https://internal.example.test/api/checkout/resend-magic-link", {
      method: "POST",
      body: JSON.stringify({ session_id: "cs_test" }),
    });

    await expect(POST(req)).resolves.toBe(expected);
    expect(mocks.sendCheckoutAuthenticationEmail).toHaveBeenCalledWith(req);
  });
});
