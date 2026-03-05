import "server-only";

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getConfiguredPublicSiteOrigin } from "@/lib/request-origin";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email";

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function appOrigin(): string {
  return getConfiguredPublicSiteOrigin() ?? "http://localhost:3000";
}

function logoUrl() {
  return new URL("/img/logo.svg", appOrigin()).toString();
}

function htmlTemplate(input: { heading: string; intro: string; ctaLabel: string; ctaUrl: string; footer?: string }): string {
  const { heading, intro, ctaLabel, ctaUrl, footer } = input;
  return [
    '<div style="background:#f8f7ff;padding:24px;font-family:Inter,Arial,sans-serif;color:#1d1330;">',
    '<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #ebe7ff;border-radius:14px;overflow:hidden;">',
    '<div style="padding:20px 24px;border-bottom:1px solid #f0ecff;background:#faf9ff;">',
    `<img src="${logoUrl()}" alt="Logo Fountain" style="height:34px;display:block;"/>`,
    "</div>",
    '<div style="padding:28px 24px;">',
    `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#1d1330;">${heading}</h1>`,
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#43355f;">${intro}</p>`,
    `<a href="${ctaUrl}" style="display:inline-block;background:#5b38f0;color:#ffffff !important;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">${ctaLabel}</a>`,
    footer ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6f6590;">${footer}</p>` : "",
    "</div>",
    "</div>",
    "</div>",
  ].join("");
}

type BaseProjectData = {
  id: string;
  client: { name: string; billingEmail: string | null };
};

async function projectData(projectId: string): Promise<BaseProjectData | null> {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, client: { select: { name: true, billingEmail: true } } },
  });
}

async function alreadySent(projectId: string, dedupeType: string): Promise<boolean> {
  const found = await prisma.auditEvent.findFirst({ where: { projectId, type: dedupeType }, select: { id: true } });
  return Boolean(found);
}

async function markSent(projectId: string, dedupeType: string): Promise<void> {
  await logAudit(prisma, { projectId, actorId: null, type: dedupeType, payload: {} });
}

async function sendEmail({ to, subject, textBody, htmlBody }: { to: string; subject: string; textBody: string; htmlBody: string }) {
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM;

  if (!postmarkToken || !from) {
    console.warn("POSTMARK_SERVER_TOKEN or POSTMARK_FROM missing; skipping lifecycle email send");
    return;
  }

  const response = await fetch(POSTMARK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Postmark-Server-Token": postmarkToken,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: subject,
      TextBody: textBody,
      HtmlBody: htmlBody,
      MessageStream: "outbound",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Postmark send failed (${response.status}): ${body}`);
  }
}

async function sendClientEmail(input: {
  projectId: string;
  dedupeType: string;
  subject: string;
  intro: string;
  ctaLabel: string;
  ctaPath: string;
  heading?: string;
}) {
  if (await alreadySent(input.projectId, input.dedupeType)) return;
  const project = await projectData(input.projectId);
  const to = project?.client.billingEmail;
  if (!to) return;

  const url = new URL(input.ctaPath, appOrigin()).toString();
  await sendEmail({
    to,
    subject: input.subject,
    textBody: `${input.intro}\n\n${input.ctaLabel}: ${url}`,
    htmlBody: htmlTemplate({
      heading: input.heading ?? input.subject,
      intro: input.intro,
      ctaLabel: input.ctaLabel,
      ctaUrl: url,
      footer: "This is a transactional project update from Logo Fountain.",
    }),
  });

  await markSent(input.projectId, input.dedupeType);
}

async function sendAdminEmail(input: {
  projectId: string;
  dedupeType: string;
  subject: string;
  intro: string;
  ctaLabel: string;
  ctaPath: string;
}) {
  if (await alreadySent(input.projectId, input.dedupeType)) return;
  const recipients = getAdminEmails();
  if (recipients.length === 0) return;

  const url = new URL(input.ctaPath, appOrigin()).toString();
  await sendEmail({
    to: recipients.join(","),
    subject: input.subject,
    textBody: `${input.intro}\n\n${input.ctaLabel}: ${url}`,
    htmlBody: htmlTemplate({
      heading: input.subject,
      intro: input.intro,
      ctaLabel: input.ctaLabel,
      ctaUrl: url,
      footer: "Admin notification for transactional workflow updates.",
    }),
  });

  await markSent(input.projectId, input.dedupeType);
}

export async function notifyClientConceptReady(projectId: string, conceptId: string) {
  await sendClientEmail({
    projectId,
    dedupeType: `email_sent:client_concept_ready:${conceptId}`,
    subject: "Your concept is ready for review",
    intro: "A new logo concept is now ready in your project. Review it and share feedback when you're ready.",
    ctaLabel: "Review concept",
    ctaPath: `/project/${projectId}/concepts`,
  });
}

export async function notifyClientRevisionReady(projectId: string, revisionRequestId: string) {
  await sendClientEmail({
    projectId,
    dedupeType: `email_sent:client_revision_ready:${revisionRequestId}`,
    subject: "Your revised concept is ready",
    intro: "We've delivered an updated concept based on your feedback. Jump back in to review the latest version.",
    ctaLabel: "Review revision",
    ctaPath: `/project/${projectId}/concepts`,
  });
}

export async function notifyClientNewMessage(projectId: string, messageId: string) {
  await sendClientEmail({
    projectId,
    dedupeType: `email_sent:client_new_message:${messageId}`,
    subject: "New message from your Logo Fountain designer",
    intro: "You have a new project message waiting for you.",
    ctaLabel: "Open messages",
    ctaPath: `/project/${projectId}/messages`,
  });
}

export async function notifyClientConceptApproved(projectId: string, conceptId: string) {
  await sendClientEmail({
    projectId,
    dedupeType: `email_sent:client_concept_approved:${conceptId}`,
    subject: "Concept approved — final files in progress",
    intro: "Great choice. Your approved concept has been confirmed and final deliverables are now being prepared.",
    ctaLabel: "View project timeline",
    ctaPath: `/project/${projectId}`,
  });
}

export async function notifyClientFinalDeliverablesReady(projectId: string) {
  await sendClientEmail({
    projectId,
    dedupeType: "email_sent:client_final_deliverables_ready",
    subject: "Your final logo files are ready",
    intro: "Your final deliverables are now ready to download from your project dashboard.",
    ctaLabel: "Download final files",
    ctaPath: `/project/${projectId}`,
  });
}

export async function notifyAdminNewProject(projectId: string) {
  await sendAdminEmail({
    projectId,
    dedupeType: "email_sent:admin_new_project",
    subject: "New project created",
    intro: "A new Logo Fountain project has been created and is ready for intake.",
    ctaLabel: "Open project",
    ctaPath: `/admin/projects/${projectId}`,
  });
}

export async function notifyAdminMessageFromProject(projectId: string, messageId: string) {
  await sendAdminEmail({
    projectId,
    dedupeType: `email_sent:admin_message_from_project:${messageId}`,
    subject: "New client message",
    intro: "A client posted a new message in an active project.",
    ctaLabel: "Open project messages",
    ctaPath: `/admin/projects/${projectId}/messages`,
  });
}

export async function notifyAdminFeedbackOnConcept(projectId: string, revisionRequestId: string) {
  await sendAdminEmail({
    projectId,
    dedupeType: `email_sent:admin_feedback_on_concept:${revisionRequestId}`,
    subject: "New concept feedback submitted",
    intro: "A client submitted revision feedback on a concept.",
    ctaLabel: "Open concept workflow",
    ctaPath: `/admin/projects/${projectId}/concepts`,
  });
}
