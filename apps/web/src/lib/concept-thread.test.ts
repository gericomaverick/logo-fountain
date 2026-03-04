import { describe, expect, it } from "vitest";

import { buildUnifiedConceptThread } from "@/lib/concept-thread";

describe("concept thread helpers", () => {
  it("sorts revision requests and comments in ascending timeline order", () => {
    const thread = buildUnifiedConceptThread(
      [
        { id: "2", body: "Revision 2", createdAt: "2026-03-01T12:00:00.000Z" },
        { id: "1", body: "Revision 1", createdAt: "2026-03-01T10:00:00.000Z" },
      ],
      [
        {
          id: "3",
          body: "Designer response",
          createdAt: "2026-03-01T11:00:00.000Z",
          author: { email: "designer@example.com", isAdmin: true },
        },
      ],
    );

    expect(thread.map((entry) => entry.id)).toEqual(["revision-1", "comment-3", "revision-2"]);
  });

  it("assigns clear role labels for client requests and designer replies", () => {
    const thread = buildUnifiedConceptThread(
      [
        {
          id: "req",
          body: "Please try another direction",
          createdAt: "2026-03-01T10:00:00.000Z",
          user: { fullName: "Acme Client", email: "client@example.com" },
          status: "open",
        },
      ],
      [
        {
          id: "admin-reply",
          body: "Absolutely, here's rationale",
          createdAt: "2026-03-01T11:00:00.000Z",
          author: { email: "designer@example.com", fullName: "Sam Lee", isAdmin: true },
        },
        {
          id: "client-followup",
          body: "Thanks",
          createdAt: "2026-03-01T11:30:00.000Z",
          author: { email: "client@example.com", fullName: "Ignored", isAdmin: false },
        },
      ],
    );

    expect(thread[0]).toMatchObject({ authorLabel: "Acme Client", roleLabel: "Client", isDesignerReply: false, status: "open" });
    expect(thread[1]).toMatchObject({ authorLabel: "Sam Lee", roleLabel: "Designer", isDesignerReply: true });
    expect(thread[2]).toMatchObject({ authorLabel: "Client", roleLabel: "Client", isDesignerReply: false });
  });
});
