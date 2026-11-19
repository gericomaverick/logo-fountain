// Laravel navigation edges: typed stubs until the auth screens (story 4.9b) and the client area (6.1, 6.2b) exist.
import type { Page } from "@playwright/test";
import type { NavigationPages } from "../navigation";

const todo = (what: string, story: string) => (): never => {
  throw new Error(`Laravel page object navigation.${what}: not implemented (story ${story})`);
};

export function navigation(_page: Page): NavigationPages {
  return {
    clientProjectPaths: todo("clientProjectPaths", "6.2b"),
    signInWithNext: todo("signInWithNext", "4.9b"),
    attemptSignIn: todo("attemptSignIn", "4.9b"),
    continueAfterPasswordSet: todo("continueAfterPasswordSet", "4.9b"),
  };
}
