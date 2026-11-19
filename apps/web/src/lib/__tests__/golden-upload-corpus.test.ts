// X-12 golden upload corpus (migration story 0.6a). Test-only: reads the shared
// corpus in tests/parity/fixtures/uploads and proves Next's validators return the
// recorded code for every file. The Laravel validators (stories 3.2/3.3) run the
// same manifest.
//
//   npx vitest run src/lib/__tests__/golden-upload-corpus.test.ts            assert
//   CAPTURE=1 npx vitest run src/lib/__tests__/golden-upload-corpus.test.ts  record expectedCode into manifest.json
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prepareConceptImage, prepareFinalZip, UploadValidationError } from "../upload-validation";

type CorpusCase = {
  id: string;
  file: string;
  kind: "image" | "zip";
  filename: string;
  mime: string;
  expectedCode?: string | null;
  branch: string | null;
  generated: boolean;
  size: number;
  sha256: string;
  note: string;
  laravelExpectedCode?: string | null;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(here, "../../../../../tests/parity/fixtures/uploads");
const manifestPath = path.join(corpusDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { description: string; cases: CorpusCase[] };
const capture = process.env.CAPTURE === "1";
const captured = new Map<string, string | null>();

function runGenerator(flag: string) {
  return spawnSync(process.execPath, [path.join(corpusDir, "generate.mjs"), flag], { encoding: "utf8" });
}

async function observe(entry: CorpusCase): Promise<{ code: string | null; message: string | null }> {
  const bytes = readFileSync(path.join(corpusDir, entry.file));
  const file = new File([bytes], entry.filename, { type: entry.mime });
  try {
    await (entry.kind === "image" ? prepareConceptImage(file) : prepareFinalZip(file));
    return { code: null, message: null };
  } catch (error) {
    if (error instanceof UploadValidationError) return { code: error.code, message: error.message };
    throw error;
  }
}

describe("X-12 golden upload corpus", () => {
  beforeAll(() => {
    if (manifest.cases.some((entry) => entry.generated && !existsSync(path.join(corpusDir, entry.file)))) {
      const result = runGenerator("--generated");
      expect(result.status, result.stderr).toBe(0);
    }
  }, 300_000);

  afterAll(() => {
    if (!capture) return;
    for (const entry of manifest.cases) if (captured.has(entry.id)) entry.expectedCode = captured.get(entry.id);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  });

  it("committed corpus files are exactly what generate.mjs builds", () => {
    const result = runGenerator("--check");
    expect(result.status, result.stderr).toBe(0);
  }, 120_000);

  it.each(manifest.cases.map((entry) => [entry.id, entry] as const))("%s", async (_id, entry) => {
    const bytes = readFileSync(path.join(corpusDir, entry.file));
    expect(bytes.length).toBe(entry.size);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);

    const observed = await observe(entry);
    // The file must reach the branch it was built for, so a file that drifts onto
    // another rejection with the same code is caught.
    expect(observed.message, `${entry.id} reached a different validator branch`).toBe(entry.branch);
    if (capture) captured.set(entry.id, observed.code);
    else expect(observed.code).toBe(entry.expectedCode);
  }, 120_000);
});
