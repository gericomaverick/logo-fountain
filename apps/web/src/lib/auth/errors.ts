export class AuthFailure extends Error {
  constructor(public status = 400, public code = "AUTH_FAILED") { super("Authentication could not be completed. Check your details or request a new link."); }
}
