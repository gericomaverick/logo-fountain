// Decided deviations DV-11 (one error envelope on the finals upload) and DV-13 (95 MB final ZIP limit), story 0.8e.
// Black box: admin multipart uploads with golden-corpus files (fixtures/uploads). FAIL on Next
// (expected-next-failures.txt): app/api/admin/projects/[id]/finals/route.ts:43,77 answer `{error:"…", code}`, and
// lib/upload-validation.ts:6 allows 100 MiB, so 95,000,001 bytes is accepted.
import { expect, test } from "../../fixtures";
import { apiClient } from "../../adapters/api";
import { seed } from "../../adapters/seed";
import { ADMIN_EMAIL } from "../../adapters/stripe";
import { corpusFile } from "../_j19-j23-helpers";
import { expectError, projectId } from "../contract/_client-helpers";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 240_000 });

const P1 = projectId("awaiting-approval"); // concept 1 approved: a finals upload is allowed

async function finalsState(admin: Awaited<ReturnType<typeof apiClient>>) {
  const s = (await (await admin.get(`/api/admin/projects/${P1}`)).json()).snapshot;
  return { status: s.status, finalZip: s.finalZip?.assetId ?? null };
}

test("DV-11/D-11 finals upload errors use the standard {error:{message, code}} envelope (no file, invalid ZIP) @deviation @api @admin @finals @uploads", async () => {
  seed("awaiting-approval");
  const admin = await apiClient({ signInAs: ADMIN_EMAIL });
  const before = await finalsState(admin);
  // FILE_REQUIRED (an empty part), and a validation failure (a decompression bomb) from the ZIP checks.
  await expectError(await admin.post(`/api/admin/projects/${P1}/finals`, { multipart: { file: { name: "final.zip", mimeType: "application/zip", buffer: Buffer.alloc(0) } } }), 400, "FILE_REQUIRED");
  await expectError(await admin.post(`/api/admin/projects/${P1}/finals`, { multipart: { file: corpusFile("zip-bomb-declared-ratio").part } }), 400, "ZIP_LIMIT_EXCEEDED");
  await expectError(await admin.post(`/api/admin/projects/${P1}/finals`, { multipart: { file: corpusFile("zip-signature-png").part } }), 400, corpusFile("zip-signature-png").case.expectedCode!);
  expect(await finalsState(admin)).toEqual(before);
  await admin.dispose();
});

test("DV-13/X-12/D-11 a 95,000,001-byte final ZIP is rejected FILE_TOO_LARGE and nothing is stored @deviation @api @admin @finals @uploads", async () => {
  seed("awaiting-approval");
  const admin = await apiClient({ signInAs: ADMIN_EMAIL });
  const { case: c, part } = corpusFile("zip-95000001");
  expect({ size: part.buffer.length, laravel: c.laravelExpectedCode }).toEqual({ size: 95_000_001, laravel: "FILE_TOO_LARGE" });
  const before = await finalsState(admin);
  const res = await admin.post(`/api/admin/projects/${P1}/finals`, { multipart: { file: part }, timeout: 180_000 });
  const body = await expectError(res, 400, "FILE_TOO_LARGE");
  expect(body.error.message).toMatch(/95/); // the new figure (95 MB), not 100
  expect(await finalsState(admin)).toEqual(before);
  await admin.dispose();
});
