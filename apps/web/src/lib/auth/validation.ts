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

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt (used by Supabase Auth) silently truncates input beyond 72 bytes, so a
// longer password would not fully count. Reject it rather than mislead the user.
export const PASSWORD_MAX_BYTES = 72;

export function validateNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `Use ${PASSWORD_MAX_BYTES} characters or fewer.`;
  }
  return null;
}

export function validatePasswordReset(password: string, confirm: string): ValidationErrors<"password" | "confirm"> {
  const errors: ValidationErrors<"password" | "confirm"> = {};

  const passwordError = validateNewPassword(password);
  if (passwordError) {
    errors.password = passwordError;
  }

  if (isBlank(confirm)) {
    errors.confirm = "Confirm your password.";
  } else if (password !== confirm) {
    errors.confirm = "Passwords do not match.";
  }

  return errors;
}

export function validatePasswordChange(
  currentPassword: string,
  password: string,
  confirm: string,
): ValidationErrors<"current" | "password" | "confirm"> {
  const errors: ValidationErrors<"current" | "password" | "confirm"> = {};

  if (isBlank(currentPassword)) {
    errors.current = "Enter your current password.";
  }

  const passwordError = validateNewPassword(password);
  if (passwordError) {
    errors.password = passwordError;
  } else if (currentPassword && password === currentPassword) {
    errors.password = "Choose a password different from your current one.";
  }

  if (isBlank(confirm)) {
    errors.confirm = "Confirm your password.";
  } else if (password !== confirm) {
    errors.confirm = "Passwords do not match.";
  }

  return errors;
}
