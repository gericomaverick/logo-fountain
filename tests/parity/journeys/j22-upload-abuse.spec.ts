// Journey 22 (02-test-strategy.md §4, abuse): hostile uploads. An oversized image, an image that would decompress
// to a huge bitmap, decompression-bomb ZIPs and a ZIP with too many entries are refused through the admin screens
// and over HTTP with the codes the golden corpus documents (fixtures/uploads/manifest.json, story 0.6a), and nothing
// is stored or published. The full corpus is asserted at the validator level (apps/web golden-upload-corpus test,
// Laravel stories 3.2/3.3). Finals error envelopes differ on Next (DV-11, journeys/deviations/dv-uploads.spec.ts),
// so the code is read from either shape here.
import { expect, test } from "../fixtures";
import { apiClient, PARITY_PASSWORD } from "../adapters/api";
import { seed } from "../adapters/seed";
import { ADMIN_EMAIL } from "../adapters/stripe";
import { adminPagesFor, pagesFor } from "../pages";
import { corpusFile, refusalCode } from "./_j19-j23-helpers";
import { projectId } from "./contract/_client-helpers";
import { randomUUID } from "./contract/_admin-helpers";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 240_000 });

const IMAGES = ["image-10mib-plus-1", "png-huge-dimensions", "jpeg-40mp-plus"];
const ZIPS = ["zip-bomb-declared-ratio", "zip-bomb-lying-size", "zip-total-expanded-over-500mib", "zip-1001-entries"];

test("X-12/D-05 J22 an oversized or decompression-bomb image is refused by the admin upload, with its code, and nothing is published @security @ui @uploads @admin", async ({ page }) => {
  seed("brief-submitted"); // no concepts yet: the first upload would publish concept 1
  const p1 = projectId("brief-submitted");
  const api = await apiClient({ signInAs: ADMIN_EMAIL });
  const concepts = async () => (await (await api.get(`/api/admin/projects/${p1}/concepts`)).json()).concepts;
  const status = async () => (await (await api.get(`/api/admin/projects/${p1}`)).json()).snapshot.status;

  for (const id of IMAGES) {
    const { case: c, part } = corpusFile(id);
    const res = await api.post(`/api/admin/projects/${p1}/concepts`, { multipart: { file: part, requestKey: randomUUID() } });
    expect({ id, status: res.status(), code: refusalCode(await res.json()) }).toEqual({ id, status: 400, code: c.expectedCode });
  }

  const { auth } = await pagesFor(page);
  await auth.signIn(ADMIN_EMAIL, PARITY_PASSWORD);
  const admin = await adminPagesFor(page);
  await admin.openProject(p1, "concepts");
  const shown = await admin.uploadConcept(corpusFile("image-10mib-plus-1").part);
  expect(shown.outcome).toBe("refused");

  expect(await concepts()).toEqual([]);
  expect(await status()).toBe("BRIEF_SUBMITTED");
  await api.dispose();
});

test("X-12/D-11 J22 decompression-bomb and too-many-entries ZIPs are refused by the finals upload, with their codes, and nothing is stored @security @ui @uploads @admin @finals", async ({ page }) => {
  seed("awaiting-approval"); // concept 1 approved: a finals upload is allowed
  const p1 = projectId("awaiting-approval");
  const api = await apiClient({ signInAs: ADMIN_EMAIL });
  const finals = async () => {
    const s = (await (await api.get(`/api/admin/projects/${p1}`)).json()).snapshot;
    return { status: s.status, finalZip: s.finalZip?.assetId ?? null };
  };
  const before = await finals();

  for (const id of ZIPS) {
    const { case: c, part } = corpusFile(id);
    const res = await api.post(`/api/admin/projects/${p1}/finals`, { multipart: { file: part } });
    expect({ id, status: res.status(), code: refusalCode(await res.json()) }).toEqual({ id, status: 400, code: c.expectedCode });
  }

  const { auth } = await pagesFor(page);
  await auth.signIn(ADMIN_EMAIL, PARITY_PASSWORD);
  const admin = await adminPagesFor(page);
  await admin.openProject(p1, "files");
  for (const id of ["zip-bomb-declared-ratio", "zip-1001-entries"]) {
    const outcome = await admin.uploadFinals(corpusFile(id).part);
    expect({ id, done: outcome.done }).toEqual({ id, done: false });
  }

  expect(await finals()).toEqual(before);
  await api.dispose();
});
