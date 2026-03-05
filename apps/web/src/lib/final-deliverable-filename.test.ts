import { describe, expect, it } from "vitest";

import { buildFinalDeliverableFilename } from "@/lib/final-deliverable-filename";

describe("buildFinalDeliverableFilename", () => {
  it("builds <client>-<company>-<date>.zip in slug-safe format", () => {
    const filename = buildFinalDeliverableFilename({
      clientName: "Alex Doe",
      companyName: "Acme & Co",
      createdAt: new Date("2026-03-05T08:00:00.000Z"),
    });

    expect(filename).toBe("alex-doe-acme-co-2026-03-05.zip");
  });

  it("falls back to email local-part and defaults", () => {
    const filename = buildFinalDeliverableFilename({
      clientEmail: "client.person@example.com",
      createdAt: new Date("2026-03-05T08:00:00.000Z"),
    });

    expect(filename).toBe("client-person-company-2026-03-05.zip");
  });
});
