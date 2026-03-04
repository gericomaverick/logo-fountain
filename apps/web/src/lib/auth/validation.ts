export type ValidationErrors<T extends string> = Partial<Record<T, string>>;

export function hasValidationErrors<T extends string>(errors: ValidationErrors<T>): boolean {
  return Object.values(errors).some(Boolean);
}

export function toErrorList<T extends string>(errors: ValidationErrors<T>): string[] {
  return Object.values(errors).filter((value): value is string => Boolean(value));
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function validateEmail(email: string): string | null {
  if (isBlank(email)) return "Enter your email address.";
  return null;
}

export function validateLogin(email: string, password: string): ValidationErrors<"email" | "password"> {
  const errors: ValidationErrors<"email" | "password"> = {};

  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (isBlank(password)) errors.password = "Enter your password.";

  return errors;
}

export function validatePasswordReset(password: string, confirm: string): ValidationErrors<"password" | "confirm"> {
  const errors: ValidationErrors<"password" | "confirm"> = {};

  if (password.length < 8) {
    errors.password = "Use at least 8 characters.";
  }

  if (isBlank(confirm)) {
    errors.confirm = "Confirm your password.";
  } else if (password !== confirm) {
    errors.confirm = "Passwords do not match.";
  }

  return errors;
}
