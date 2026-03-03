import { describe, expect, it } from "vitest";

import { classifyWebhookError } from "./webhook-error-classification";

describe("classifyWebhookError", () => {
  it("classifies known transient infrastructure errors as retryable", () => {
    const result = classifyWebhookError({ code: "P1001" });
    expect(result.kind).toBe("transient");
    expect(result.shouldRetry).toBe(true);
    expect(result.responseStatus).toBe(500);
  });

  it("classifies malformed payload / allowlist failures as permanent", () => {
    const result = classifyWebhookError(
      new Error("Checkout session did not resolve to exactly one allowlisted package"),
    );
    expect(result.kind).toBe("permanent");
    expect(result.shouldRetry).toBe(false);
    expect(result.responseStatus).toBe(200);
  });
});
