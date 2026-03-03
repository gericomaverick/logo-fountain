import { describe, expect, it, vi } from "vitest";

import { createProjectSystemMessage } from "./system-messages";

describe("createProjectSystemMessage", () => {
  it("creates a system message with kind=system when no duplicate exists", async () => {
    const tx = {
      profile: { findFirst: vi.fn().mockResolvedValue({ id: "admin-1" }) },
      messageThread: { upsert: vi.fn().mockResolvedValue({ id: "thread-1" }) },
      message: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "m1" }),
      },
    } as const;

    await createProjectSystemMessage(tx as never, {
      projectId: "p1",
      fallbackUserId: "u1",
      body: "Concept 1 is ready for review.",
    });

    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          threadId: "thread-1",
          projectId: "p1",
          senderId: "admin-1",
          kind: "system",
          body: "Concept 1 is ready for review.",
        }),
      }),
    );
  });

  it("does not create a duplicate when same system body already exists", async () => {
    const tx = {
      profile: { findFirst: vi.fn().mockResolvedValue({ id: "admin-1" }) },
      messageThread: { upsert: vi.fn().mockResolvedValue({ id: "thread-1" }) },
      message: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing" }),
        create: vi.fn(),
      },
    } as const;

    await createProjectSystemMessage(tx as never, {
      projectId: "p1",
      fallbackUserId: "u1",
      body: "Concept 1 is ready for review.",
    });

    expect(tx.message.create).not.toHaveBeenCalled();
  });
});
