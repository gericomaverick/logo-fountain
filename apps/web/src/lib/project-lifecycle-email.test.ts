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
  ADMIN_NOTIFICATION_EMAILS: process.env.ADMIN_NOTIFICATION_EMAILS,
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
    process.env.ADMIN_NOTIFICATION_EMAILS = "admin1@example.com,admin2@example.com";
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
            user: { email: "owner@example.com", firstName: "Jamie", lastName: "Lopez", fullName: "Jamie Lopez" },
          },
        ],
      },
      briefs: [],
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
    await expect(notifyClientConceptReady("p1", "c1")).resolves.toEqual({ status: "sent" });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body as string);
    expect(payload.To).toBe("client@example.com");
    expect(payload.Subject).toContain("concept is ready");

    mocks.findAudit.mockResolvedValueOnce({ id: "audit-existing" });
    await notifyClientConceptReady("p1", "c1");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns explicit skipped status and does not mark sent when configuration is missing", async () => {
    delete process.env.POSTMARK_SERVER_TOKEN;

    await expect(notifyAdminNewProject("p1")).resolves.toEqual({
      status: "skipped",
      reason: "not_configured",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("does not read or expose a rejected provider response body", async () => {
    const text = vi.fn().mockResolvedValue("secret provider body");
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 422, text });

    await expect(notifyAdminNewProject("p1")).rejects.toThrow("Postmark send failed (422)");
    expect(text).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("routes admin notifications to ADMIN_NOTIFICATION_EMAILS and includes project and client context", async () => {
    await notifyAdminNewProject("p1");
    await notifyAdminMessageFromProject("p1", "m1");
    await notifyAdminFeedbackOnConcept("p1", "r1");
    await notifyAdminConceptApproved("p1", "c1");

    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    const first = JSON.parse(mocks.fetch.mock.calls[0][1].body as string);
    expect(first.To).toBe("admin1@example.com,admin2@example.com");
    expect(first.TextBody).toContain("Client: Jamie Lopez");
    expect(first.TextBody).toContain("Brand: Acme Pizza");
    expect(first.TextBody).not.toContain("Project:");

    for (const call of mocks.fetch.mock.calls) {
      const payload = JSON.parse(call[1].body as string);
      expect(payload.TextBody).not.toContain("—");
      expect(payload.HtmlBody).not.toContain("—");
    }
  });

  it("falls back to owner email when billing email is missing", async () => {
    mocks.findProject.mockResolvedValueOnce({
      id: "p1",
      client: {
        name: "Acme Pizza",
        billingEmail: null,
        memberships: [
          {
            role: "owner",
            user: { email: "owner@example.com", firstName: "Jamie", lastName: "Lopez", fullName: "Jamie Lopez" },
          },
        ],
      },
      briefs: [],
    });

    await notifyClientConceptReady("p1", "c-owner");

    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body as string);
    expect(payload.To).toBe("owner@example.com");
  });

  it("escapes hostile client names and brief answers in admin HTML", async () => {
    mocks.findProject.mockResolvedValueOnce({
      id: "p1",
      client: {
        name: "Fallback",
        billingEmail: "client@example.com",
        memberships: [{
          role: "owner",
          user: { email: "owner@example.com", firstName: "<script>alert(1)</script>", lastName: "O'Reilly", fullName: null },
        }],
      },
      briefs: [{ answers: { brandName: '</p><img src=x onerror="alert(2)">' } }],
    });

    await notifyAdminNewProject("p1");

    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body as string);
    expect(payload.HtmlBody).not.toContain("<script>");
    expect(payload.HtmlBody).not.toContain("<img src=x");
    expect(payload.HtmlBody).toContain("&lt;script&gt;alert(1)&lt;/script&gt; O&#39;Reilly");
    expect(payload.HtmlBody).toContain("&lt;/p&gt;&lt;img src=x onerror=&quot;alert(2)&quot;&gt;");
  });

  it("prefers brief brand name over client record name in admin emails", async () => {
    mocks.findProject.mockResolvedValueOnce({
      id: "p1",
      client: {
        name: "Jamie Lopez",
        billingEmail: "client@example.com",
        memberships: [
          {
            role: "owner",
            user: { email: "owner@example.com", firstName: "Jamie", lastName: "Lopez", fullName: "Jamie Lopez" },
          },
        ],
      },
      briefs: [{ answers: { brandName: "Northvale Analytics" } }],
    });

    await notifyAdminNewProject("p1");

    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body as string);
    expect(payload.TextBody).toContain("Brand: Northvale Analytics");
    expect(payload.TextBody).not.toContain("Brand: Jamie Lopez");
  });

  it("does not let a legacy unscoped marker suppress a new asset-scoped final notification", async () => {
    mocks.findAudit.mockImplementation(async (query: { where: { type: string } }) =>
      query.where.type === "email_sent:client_final_deliverables_ready" ? { id: "legacy-marker" } : null,
    );

    await expect(notifyClientFinalDeliverablesReady("p1", "asset-current")).resolves.toEqual({ status: "sent" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "email_sent:client_final_deliverables_ready:asset-current" }),
    }));
  });

  it("scopes final-ready sent markers to the immutable publication asset", async () => {
    await expect(notifyClientFinalDeliverablesReady("p1", "asset-2")).resolves.toEqual({ status: "sent" });
    expect(mocks.findAudit).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: "p1", type: "email_sent:client_final_deliverables_ready:asset-2" },
    }));
    expect(mocks.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "email_sent:client_final_deliverables_ready:asset-2" }),
    }));
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
