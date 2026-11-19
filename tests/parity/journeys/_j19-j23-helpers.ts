// Shared arrangement for abuse journeys 19-23 and the deviation tests (story 0.8e). Black-box only.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const uploads = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/uploads");
export type CorpusCase = { id: string; file: string; kind: "image" | "zip"; filename: string; mime: string; size: number; expectedCode: string | null; laravelExpectedCode?: string; generated: boolean };
const manifest = JSON.parse(readFileSync(join(uploads, "manifest.json"), "utf8")) as { cases: CorpusCase[] };

/**
 * A golden-corpus file (fixtures/uploads, story 0.6a) as a multipart part. Large files live in the git-ignored
 * `.generated/` and are built on demand by the corpus generator.
 */
export function corpusFile(id: string): { case: CorpusCase; part: { name: string; mimeType: string; buffer: Buffer } } {
  const c = manifest.cases.find((x) => x.id === id);
  if (!c) throw new Error(`no corpus case ${id}`);
  const path = join(uploads, c.file);
  if (c.generated && !existsSync(path)) execFileSync(process.execPath, [join(uploads, "generate.mjs"), "--generated"], { stdio: "ignore" });
  return { case: c, part: { name: c.filename, mimeType: c.mime, buffer: readFileSync(path) } };
}

/** The error code of an upload refusal, from the standard `{error:{code}}` or Next's finals `{error, code}` (DV-11). */
export const refusalCode = (body: any): string | undefined => (typeof body?.error === "object" ? body.error?.code : body?.code);
