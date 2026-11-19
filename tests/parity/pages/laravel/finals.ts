// Laravel final files: typed stubs until the Overview banner and the Files tab exist (story 6.11).
import type { Page } from "@playwright/test";
import type { FinalsPages } from "../finals";

const todo = (what: string) => (): never => {
  throw new Error(`Laravel page object finals.${what}: not implemented (story 6.11)`);
};

export function finals(_page: Page): FinalsPages {
  return { finalFilesOffered: todo("finalFilesOffered"), downloadFinalFiles: todo("downloadFinalFiles") };
}
