import { describe, expect, it } from "vitest";

import {
  hasValidationErrors,
  toErrorList,
  validateEmail,
  validateLogin,
  validatePasswordReset,
} from "./validation";

describe("auth validation", () => {
  it("validates login fields with actionable messages", () => {
    expect(validateLogin("", "")).toEqual({
      email: "Enter your email address.",
      password: "Enter your password.",
    });

    expect(validateLogin("person@example.com", "secret")).toEqual({});
  });

  it("validates email presence", () => {
    expect(validateEmail("   ")).toBe("Enter your email address.");
    expect(validateEmail("person@example.com")).toBeNull();
  });

  it("validates password reset fields", () => {
    expect(validatePasswordReset("short", "")).toEqual({
      password: "Use at least 8 characters.",
      confirm: "Confirm your password.",
    });

    expect(validatePasswordReset("longenough", "different")).toEqual({
      confirm: "Passwords do not match.",
    });

    expect(validatePasswordReset("longenough", "longenough")).toEqual({});
  });

  it("builds summary data", () => {
    const errors = { email: "Enter your email address.", password: "Enter your password." };
    expect(hasValidationErrors(errors)).toBe(true);
    expect(toErrorList(errors)).toEqual(["Enter your email address.", "Enter your password."]);
    expect(hasValidationErrors({})).toBe(false);
  });
});
