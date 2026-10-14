import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  consumeCheckoutAuthEmailLimit,
  resetCheckoutAuthEmailLimitForTests,
} from "./checkout-auth-email-rate-limit";

describe("checkout authentication email rate limiter", () => {
  beforeEach(() => resetCheckoutAuthEmailLimitForTests());

  it("enforces a shared per-session ceiling across send paths", () => {
    const input = { sessionId: "cs_shared", destination: "buyer@example.com", now: 1_000_000 };

    expect(consumeCheckoutAuthEmailLimit(input)).toEqual({ allowed: true });
    expect(consumeCheckoutAuthEmailLimit({ ...input, now: input.now + 1 })).toEqual({ allowed: true });
    expect(consumeCheckoutAuthEmailLimit({ ...input, now: input.now + 2 })).toEqual({ allowed: true });
    expect(consumeCheckoutAuthEmailLimit({ ...input, now: input.now + 3 })).toEqual({
      allowed: false,
      retryAfterSeconds: 900,
    });
  });

  it("enforces a destination ceiling across different session ids", () => {
    for (let index = 0; index < 5; index += 1) {
      expect(
        consumeCheckoutAuthEmailLimit({
          sessionId: `cs_${index}`,
          destination: "same@example.com",
          now: 2_000_000 + index,
        }),
      ).toEqual({ allowed: true });
    }

    expect(
      consumeCheckoutAuthEmailLimit({
        sessionId: "cs_sixth",
        destination: " SAME@example.com ",
        now: 2_000_006,
      }),
    ).toEqual({ allowed: false, retryAfterSeconds: 3600 });
  });

  it("expires old entries and permits a later send", () => {
    for (let index = 0; index < 3; index += 1) {
      consumeCheckoutAuthEmailLimit({ sessionId: "cs_expiring", destination: "buyer@example.com", now: index });
    }

    expect(
      consumeCheckoutAuthEmailLimit({
        sessionId: "cs_expiring",
        destination: "buyer@example.com",
        now: 15 * 60_000 + 1,
      }),
    ).toEqual({ allowed: true });
  });
});
