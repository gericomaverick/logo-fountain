import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  findAudit: vi.fn(),
  createAudit: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.findProject },
    auditEvent: { findFirst: mocks.findAudit, create: mocks.createAudit },
  },
}));

import {
  notifyAdminConceptApproved,
  notifyAdminFeedbackOnConcept,
  notifyAdminMessageFromProject,
  notifyAdminNewProject,
  notifyClientConceptApproved,
  notifyClientConceptReady,
  notifyClientFinalDeliverablesReady,
  notifyClientNewMessage,
  notifyClientRevisionReady,
} from "./project-lifecycle-email";

const ORIGINAL_ENV = {
  POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
  POSTMARK_FROM: process.env.POSTMARK_FROM,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key as keyof typeof process.env];
    else process.env[key as keyof typeof process.env] = value;
  }
}

describe("project lifecycle emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POSTMARK_SERVER_TOKEN = "pm-token";
    process.env.POSTMARK_FROM = "noreply@logofountain.com";
    process.env.ADMIN_EMAILS = "admin1@example.com,admin2@example.com";
    process.env.PUBLIC_SITE_URL = "https://app.logofountain.test";

    mocks.findAudit.mockResolvedValue(null);
    mocks.findProject.mockResolvedValue({
      id: "p1",
      client: {
        name: "Acme Pizza",
        billingEmail: "client@example.com",
        memberships: [
          {
            role: "owner",
            user: { firstName: "Jamie", lastName: "Lopez", fullName: "Jamie Lopez" },
          },
        ],
      },
    });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
    mocks.fetch.mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
  });

  it("sends client concept-ready emails once per concept id", async () => {
    await notifyClientConceptReady("p1", "c1");

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body as string);
    expect(payload.To).toBe("client@example.com");
    expect(payload.Subject).toContain("concept is ready");

    mocks.findAudit.mockResolvedValueOnce({ id: "audit-existing" });
    await notifyClientConceptReady("p1", "c1");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("routes admin notifications to ADMIN_EMAILS and includes project and client context", async () => {
    await notifyAdminNewProject("p1");
    await notifyAdminMessageFromProject("p1", "m1");
    await notifyAdminFeedbackOnConcept("p1", "r1");
    await notifyAdminConceptApproved("p1", "c1");

    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    const first = JSON.parse(mocks.fetch.mock.calls[0][1].body as string);
    expect(first.To).toBe("admin1@example.com,admin2@example.com");
    expect(first.TextBody).toContain("Project: Acme Pizza (p1)");
    expect(first.TextBody).toContain("Client: Jamie Lopez");

    for (const call of mocks.fetch.mock.calls) {
      const payload = JSON.parse(call[1].body as string);
      expect(payload.TextBody).not.toContain("—");
      expect(payload.HtmlBody).not.toContain("—");
    }
  });

  it("sends all remaining client lifecycle notifications", async () => {
    await notifyClientRevisionReady("p1", "r1");
    await notifyClientNewMessage("p1", "m1");
    await notifyClientConceptApproved("p1", "c1");
    await notifyClientFinalDeliverablesReady("p1");

    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    for (const call of mocks.fetch.mock.calls) {
      const payload = JSON.parse(call[1].body as string);
      expect(payload.HtmlBody).toContain("Logo Fountain");
      expect(payload.HtmlBody).toContain("background:#f8f7ff");
      expect(payload.HtmlBody).toContain("border-radius:14px");
      expect(payload.MessageStream).toBe("outbound");
      expect(payload.TextBody).not.toContain("—");
      expect(payload.HtmlBody).not.toContain("—");
    }
  });
});
