// Journey 4 (02-test-strategy.md §4, ux-design.md §7 "Concepts arrive"): the studio publishes a concept (admin API;
// the admin screens are journey 14, story 0.8d) -> the client gets the concept-ready email -> the project flags new
// concepts -> the gallery and the concept open -> the signed image really loads from the object store -> the flag clears.
import type { Response } from "@playwright/test";
import { expect, test } from "../fixtures";
import { apiClient, baseURL, PARITY_PASSWORD } from "../adapters/api";
import { extractLinks, getMessage, mailbox } from "../adapters/mail";
import { seed } from "../adapters/seed";
import { ADMIN_EMAIL } from "../adapters/stripe";
import { pagesFor } from "../pages";
import { makePng, uploadConcept } from "./contract/_admin-helpers";

const CLIENT = "client.a@parity.test";
const CONCEPT_READY = "Your concept is ready for review"; // lib/project-lifecycle-email.ts (N-04)

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 180_000 });

test("D-06/N-04/C-03/C-08/C-09/N-15 J4 a published concept is emailed, flagged as new, opens with its signed image from storage, and the flag clears once seen @ui @concepts @email @storage", async ({ page }) => {
  seed("brief-submitted");
  const { auth, portal, concepts, thread } = await pagesFor(page);
  await auth.signIn(CLIENT, PARITY_PASSWORD);
  await portal.openProject();
  const projectId = await portal.currentProjectId();
  expect(await portal.projectStatus()).toBe("BRIEF_SUBMITTED");
  expect(await concepts.hasNewConcepts()).toBe(false);

  // The studio publishes concept 1 (upload publishes straight away; D-06's draft-publish path is the legacy one, F-10).
  const inbox = await mailbox(CLIENT);
  const png = makePng(7);
  const admin = await apiClient({ signInAs: ADMIN_EMAIL });
  try {
    const res = await uploadConcept(admin, projectId, { file: { name: "concept-1.png", mimeType: "image/png", buffer: png }, notes: "A first direction" });
    expect(res.status(), await res.text()).toBe(200);
  } finally {
    await admin.dispose();
  }

  // N-04: exactly one email to the client, linking to the project's concepts.
  const [mail] = await inbox.next(1);
  expect(mail.subject).toBe(CONCEPT_READY);
  expect(await inbox.countAfterSettle(1_000)).toBe(1);
  expect(extractLinks(await getMessage(mail.id))).toContain(`${baseURL}/project/${projectId}/concepts`);

  // C-03: the project now shows new concepts, and it's the client's turn.
  expect(await concepts.hasNewConcepts()).toBe(true);
  expect(await portal.projectStatus()).toBe("CONCEPTS_READY");
  expect(await portal.currentTurn()).toBe("client");

  // C-08/C-09: the gallery lists it; the concept's image is a signed object-store URL that really loads.
  expect(await concepts.openGallery()).toEqual([{ number: 1, version: 1 }]);
  const images: Response[] = [];
  page.on("response", (r) => { if (r.request().resourceType() === "image") images.push(r); });
  await concepts.openConcept(1);
  const image = await concepts.shownImage();
  expect(image).toMatchObject({ naturalWidth: 2, naturalHeight: 2 }); // makePng is 2x2
  // Next re-signs image URLs on every poll (finding F-15), so the shown src's query may be newer than the
  // recorded response: match the object (origin and path), not the signature (story 0.9 flake fix).
  const objectOf = (u: string) => { const x = new URL(u); return x.origin + x.pathname; };
  const fromStore = images.findLast((r) => objectOf(r.url()) === objectOf(image.src));
  if (!fromStore) throw new Error(`no network response for the shown image ${image.src}`);
  expect(fromStore.status()).toBe(200);
  expect(new URL(image.src).origin).not.toBe(baseURL); // straight from the object store, not proxied by the app
  expect(new URL(fromStore.url()).searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/); // presigned, not public
  expect(Buffer.compare(await fromStore.body(), png)).toBe(0); // the bytes the studio uploaded

  // Seen: the new-concepts flag is gone.
  expect(await concepts.hasNewConcepts()).toBe(false);

  // N-15: the system message, in the project's conversation.
  expect(await thread.systemMessages()).toContain("Concept 1 is ready for review.");
});
