// Decided deviation DV-12 (stable imageKey beside the re-signed image URL), story 0.8e. Black box: two polls of
// every payload that carries a concept image. FAILS on Next (expected-next-failures.txt): no payload has an
// imageKey; each poll only re-signs imageUrl (lib/project-snapshot.ts:234, app/api/projects/[id]/concepts/route.ts:91,
// app/api/admin/projects/[id]/concepts/route.ts:131).
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { apiClient } from "../../adapters/api";
import { seed } from "../../adapters/seed";
import { ADMIN_EMAIL } from "../../adapters/stripe";
import { conceptId, projectId } from "../contract/_client-helpers";
import { pngFile, uploadConcept } from "../contract/_admin-helpers";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 120_000 });

const P1 = projectId("revision-reserved"); // two published concepts, a revision requested on concept 1
const C1 = conceptId("revision-reserved", 1);

type Keyed = Record<number, { imageKey: unknown; imageUrl: unknown }>;
const keyed = (concepts: any[]): Keyed => Object.fromEntries(concepts.map((c) => [c.number, { imageKey: c.imageKey, imageUrl: c.imageUrl }]));

const payloads = (client: APIRequestContext, admin: APIRequestContext) => ({
  snapshot: async () => keyed((await (await client.get(`/api/projects/${P1}`)).json()).snapshot.concepts),
  clientConcepts: async () => keyed((await (await client.get(`/api/projects/${P1}/concepts`)).json()).concepts),
  adminConcepts: async () => keyed((await (await admin.get(`/api/admin/projects/${P1}/concepts`)).json()).concepts),
});

test("DV-12/C-03/C-08/D-05 snapshot and concept payloads carry an imageKey that is identical across polls and changes only with the image @deviation @api @concepts @storage", async () => {
  seed("revision-reserved");
  const client = await apiClient({ signInAs: "client.a@parity.test" });
  const admin = await apiClient({ signInAs: ADMIN_EMAIL });
  const read = payloads(client, admin);

  const first: Record<string, Keyed> = {};
  for (const [name, poll] of Object.entries(read)) {
    const a = await poll();
    await new Promise((r) => setTimeout(r, 1_100)); // a later signature (X-Amz-Date has 1 s resolution)
    const b = await poll();
    expect(Object.keys(a), name).toEqual(["1", "2"]);
    for (const n of [1, 2]) {
      expect(typeof a[n].imageKey === "string" && (a[n].imageKey as string).length > 0, `${name} concept ${n} imageKey`).toBe(true);
      expect(b[n].imageKey, `${name} concept ${n}: same key on the next poll`).toBe(a[n].imageKey);
      // The key must not be the signed URL itself (that changes every poll).
      expect(String(a[n].imageUrl)).not.toBe(a[n].imageKey);
    }
    expect(a[1].imageKey).not.toBe(a[2].imageKey);
    first[name] = a;
  }

  // A new image (the revision upload) changes that concept's key only.
  const up = await uploadConcept(admin, P1, { file: pngFile(11, "revision.png"), uploadMode: "revision", conceptId: C1 });
  expect(up.status(), await up.text()).toBe(200);
  for (const [name, poll] of Object.entries(read)) {
    const after = await poll();
    expect(after[1].imageKey, `${name}: revised concept 1 has a new key`).not.toBe(first[name][1].imageKey);
    expect(after[2].imageKey, `${name}: concept 2 keeps its key`).toBe(first[name][2].imageKey);
  }
  await client.dispose();
  await admin.dispose();
});
