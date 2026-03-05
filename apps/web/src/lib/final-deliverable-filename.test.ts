import { describe, expect, it } from "vitest";

import { buildFinalDeliverableFilename } from "@/lib/final-deliverable-filename";

describe("buildFinalDeliverableFilename", () => {
  it("builds <brand>-<date>.zip using company name when present", () => {
    const filename = buildFinalDeliverableFilename({
      clientName: "Alex Doe",
      companyName: "Acme & Co",
      createdAt: new Date("2026-03-05T08:00:00.000Z"),
    });

    expect(filename).toBe("acme-co-2026-03-05.zip");
  });

  it("falls back to client name, then email local-part, then default", () => {
    const fromClientName = buildFinalDeliverableFilename({
      clientName: "Alex Doe",
      createdAt: new Date("2026-03-05T08:00:00.000Z"),
    });
    expect(fromClientName).toBe("alex-doe-2026-03-05.zip");

    const fromEmail = buildFinalDeliverableFilename({
      clientEmail: "client.person@example.com",
      createdAt: new Date("2026-03-05T08:00:00.000Z"),
    });
    expect(fromEmail).toBe("client-person-2026-03-05.zip");

    const fromDefault = buildFinalDeliverableFilename({
      createdAt: new Date("2026-03-05T08:00:00.000Z"),
    });
    expect(fromDefault).toBe("logo-fountain-2026-03-05.zip");
  });
});
