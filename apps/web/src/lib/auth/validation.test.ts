import { describe, expect, it } from "vitest";

import {
  hasValidationErrors,
  toErrorList,
  validateEmail,
  validateLogin,
  validateNewPassword,
  validatePasswordChange,
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

  it("enforces password length bounds", () => {
    expect(validateNewPassword("short")).toBe("Use at least 8 characters.");
    expect(validateNewPassword("longenough")).toBeNull();
    expect(validateNewPassword("a".repeat(73))).toBe("Use 72 characters or fewer.");
    // Multi-byte characters count by UTF-8 byte length, not string length.
    expect(validateNewPassword("😀".repeat(19))).toBe("Use 72 characters or fewer.");
  });

  it("validates in-dashboard password changes", () => {
    expect(validatePasswordChange("", "short", "")).toEqual({
      current: "Enter your current password.",
      password: "Use at least 8 characters.",
      confirm: "Confirm your password.",
    });

    expect(validatePasswordChange("current-pass", "current-pass", "current-pass")).toEqual({
      password: "Choose a password different from your current one.",
    });

    expect(validatePasswordChange("current-pass", "brand-new-pass", "brand-new-pass")).toEqual({});
  });

  it("builds summary data", () => {
    const errors = { email: "Enter your email address.", password: "Enter your password." };
    expect(hasValidationErrors(errors)).toBe(true);
    expect(toErrorList(errors)).toEqual(["Enter your email address.", "Enter your password."]);
    expect(hasValidationErrors({})).toBe(false);
  });
});
