// Navigation and sign-in edges (story 0.8e: abuse cases 19 and 21, DV-UX landings). What a person does, never how
// a screen is built: every method also fits the redesigned IA (ux-design.md §5.1, §5.3), where a customer with one
// project lands straight on it and the sign-in screen honours a safe `next`.
import type { Page } from "@playwright/test";
import { resolveTarget } from "../adapters/target";

export interface NavigationPages {
  /**
   * The client-area addresses of a project a person can be sent to (links in emails, bookmarks): overview,
   * concepts gallery, one concept, messages, brief. Paths only, relative to the app origin.
   */
  clientProjectPaths(projectId: string, conceptId: string): string[];
  /**
   * Opens the sign-in screen carrying `next` (as a protected page or an email link would send someone there)
   * and signs in. Resolves once the app has finished redirecting, wherever that is.
   */
  signInWithNext(next: string, email: string, password: string): Promise<void>;
  /**
   * Submits the sign-in form once (from a fresh sign-in screen). Resolves with the error message the screen shows,
   * or null when the person got signed in.
   */
  attemptSignIn(email: string, password: string): Promise<string | null>;
  /**
   * Right after auth.setPasswordFromLink: does whatever the app asks next (signs in with `password` when it shows
   * the sign-in screen; nothing when it already signed the person in). Resolves once off the auth screens.
   */
  continueAfterPasswordSet(email: string, password: string): Promise<void>;
}

export async function navigationPagesFor(page: Page): Promise<NavigationPages> {
  const impl = resolveTarget() === "next" ? await import("./next/navigation") : await import("./laravel/navigation");
  return impl.navigation(page);
}
