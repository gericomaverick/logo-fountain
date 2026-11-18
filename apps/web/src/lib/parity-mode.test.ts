import { describe, expect, it } from "vitest";

import { parityOverride, stripeParityOptions } from "./parity-mode";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("parity-mode seams (O-09)", () => {
  it("is inert unless PARITY_MODE=1", () => {
    expect(parityOverride("POSTMARK_API_URL", env({ POSTMARK_API_URL: "http://127.0.0.1:4320/email" }))).toBeUndefined();
    expect(parityOverride("R2_ENDPOINT", env({ PARITY_MODE: "0", R2_ENDPOINT: "http://127.0.0.1:8333" }))).toBeUndefined();
    expect(stripeParityOptions(env({ STRIPE_API_BASE: "http://127.0.0.1:12111" }))).toEqual({});
  });

  it("returns the override in parity mode", () => {
    const values = env({ PARITY_MODE: "1", NODE_ENV: "development", POSTMARK_API_URL: " http://127.0.0.1:4320/email " });
    expect(parityOverride("POSTMARK_API_URL", values)).toBe("http://127.0.0.1:4320/email");
    expect(parityOverride("R2_ENDPOINT", values)).toBeUndefined();
  });

  it("maps STRIPE_API_BASE to Stripe SDK connection options", () => {
    expect(stripeParityOptions(env({ PARITY_MODE: "1", STRIPE_API_BASE: "http://127.0.0.1:12111" }))).toEqual({ host: "127.0.0.1", port: 12111, protocol: "http" });
    expect(stripeParityOptions(env({ PARITY_MODE: "1", STRIPE_API_BASE: "https://stripe-fake" }))).toEqual({ host: "stripe-fake", port: 443, protocol: "https" });
  });

  it("refuses parity mode in production", () => {
    expect(() => parityOverride("POSTMARK_API_URL", env({ PARITY_MODE: "1", NODE_ENV: "production", POSTMARK_API_URL: "http://x" }))).toThrow(/not allowed in production/);
  });
});
