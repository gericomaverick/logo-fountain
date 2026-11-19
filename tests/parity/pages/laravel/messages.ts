// Laravel project messages: typed stubs until the Messages tab exists (story 6.10).
import type { Page } from "@playwright/test";
import type { MessagesPages } from "../messages";

const todo = (what: string) => (): never => {
  throw new Error(`Laravel page object messages.${what}: not implemented (story 6.10)`);
};

export function messages(_page: Page): MessagesPages {
  return { open: todo("open"), send: todo("send"), thread: todo("thread") };
}
