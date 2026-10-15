import type Stripe from "stripe";

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PRICE_ID_TO_PACKAGE, stripe, type PackageCode } from "@/lib/stripe";

export const ORDER_STATUS_FULFILLED = "FULFILLED";
export const ORDER_STATUS_NEEDS_CONTACT = "NEEDS_CONTACT";
const PROJECT_STATUS_AWAITING_BRIEF = "AWAITING_BRIEF";

export class CheckoutSessionNotPaidError extends Error {
  readonly code = "CHECKOUT_SESSION_NOT_PAID";

  constructor(readonly paymentStatus: string | null) {
    super(`Checkout session is not paid (payment_status: ${paymentStatus ?? "missing"})`);
    this.name = "CheckoutSessionNotPaidError";
  }
}

const PACKAGE_ENTITLEMENTS: Record<PackageCode, Array<{ key: string; limitInt: number }>> = {
  essential: [
    { key: "concepts", limitInt: 1 },
    { key: "revisions", limitInt: 1 },
  ],
  professional: [
    { key: "concepts", limitInt: 2 },
    { key: "revisions", limitInt: 2 },
  ],
  complete: [
    { key: "concepts", limitInt: 3 },
    { key: "revisions", limitInt: 3 },
  ],
};

type CheckoutName = {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
};

type UpsellMetadata =
  | {
      kind: "addon";
      projectId: string;
      addonKey: "extra_revision";
      fromPackage: PackageCode | null;
    }
  | {
      kind: "upgrade";
      projectId: string;
      fromPackage: PackageCode;
      toPackage: PackageCode;
    };

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePackageCode(value: unknown): PackageCode | null {
  if (value === "essential" || value === "professional" || value === "complete") return value;
  return null;
}

function parseUpsellMetadata(session: Stripe.Checkout.Session): UpsellMetadata | null {
  const metadata = session.metadata ?? {};
  const kind = normalizeText(metadata.kind);
  const projectId = normalizeText(metadata.projectId);
  if (!kind || !projectId) return null;

  if (kind === "addon") {
    const addonKey = normalizeText(metadata.addonKey);
    if (addonKey !== "extra_revision") return null;

    return {
      kind,
      projectId,
      addonKey,
      fromPackage: parsePackageCode(metadata.fromPackage),
    };
  }

  if (kind === "upgrade") {
    const fromPackage = parsePackageCode(metadata.fromPackage);
    const toPackage = parsePackageCode(metadata.toPackage);
    if (!fromPackage || !toPackage) return null;
    return { kind, projectId, fromPackage, toPackage };
  }

  return null;
}

function checkoutNameFromSession(session: Stripe.Checkout.Session): CheckoutName {
  const customFields = session.custom_fields ?? [];

  const firstName = normalizeText(
    customFields.find((field) => field.key === "first_name" && field.type === "text")?.text?.value,
  );
  const lastName = normalizeText(
    customFields.find((field) => field.key === "last_name" && field.type === "text")?.text?.value,
  );

  const fullNameFromFields = normalizeText([firstName, lastName].filter(Boolean).join(" "));
  const fullName = fullNameFromFields ?? normalizeText(session.customer_details?.name);

  return { firstName, lastName, fullName };
}

function inferClientName(session: Stripe.Checkout.Session, checkoutName: CheckoutName): string {
  if (checkoutName.fullName) return checkoutName.fullName;

  const fromStripe = normalizeText(session.customer_details?.name);
  if (fromStripe) return fromStripe;

  const email = session.customer_details?.email?.trim() || "";
  const localPart = email.split("@")[0];
  return localPart || "Logo Fountain Client";
}

async function packageCodeFromSession(sessionId: string): Promise<PackageCode> {
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 10 });
  const packageCodes = new Set<PackageCode>();

  for (const item of lineItems.data) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    const mapped = PRICE_ID_TO_PACKAGE[priceId];
    if (mapped) packageCodes.add(mapped);
  }

  if (packageCodes.size !== 1) {
    throw new Error("Checkout session did not resolve to exactly one allowlisted package");
  }

  return Array.from(packageCodes)[0];
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export async function purchaserEmailFromSession(session: Stripe.Checkout.Session): Promise<string | null> {
  const fromCustomerDetails = normalizeEmail(session.customer_details?.email);
  if (fromCustomerDetails) return fromCustomerDetails;

  if (session.customer && typeof session.customer === "object") {
    const fromExpandedCustomer = normalizeEmail((session.customer as Stripe.Customer).email);
    if (fromExpandedCustomer) return fromExpandedCustomer;
  }

  if (typeof session.customer === "string") {
    const customer = await stripe.customers.retrieve(session.customer);
    if (!("deleted" in customer && customer.deleted)) {
      return normalizeEmail(customer.email);
    }
  }

  return null;
}

export type FulfillmentResult = {
  deduped: boolean;
  projectId: string;
  orderId: string;
  clientId: string;
  purchaserEmail: string | null;
  firstName: string | null;
  lastName: string | null;
};

async function fulfillUpsellSession(
  session: Stripe.Checkout.Session,
  metadata: UpsellMetadata,
  purchaserEmail: string | null,
  checkoutName: CheckoutName,
): Promise<FulfillmentResult> {
  const sessionId = session.id;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

  const existingOrder = await prisma.projectOrder.findFirst({
    where: {
      OR: [{ stripeCheckoutSessionId: sessionId }, ...(paymentIntentId ? [{ stripePaymentIntentId: paymentIntentId }] : [])],
    },
    select: { id: true, projectId: true, clientId: true },
  });

  if (existingOrder) {
    return {
      deduped: true,
      projectId: existingOrder.projectId,
      orderId: existingOrder.id,
      clientId: existingOrder.clientId,
      purchaserEmail,
      firstName: checkoutName.firstName,
      lastName: checkoutName.lastName,
    };
  }

  const currency = (session.currency || "gbp").toLowerCase();
  const totalCents = session.amount_total ?? 0;

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: metadata.projectId },
      select: { id: true, clientId: true, packageCode: true },
    });

    if (!project) throw new Error("Upsell fulfillment failed: project not found");

    if (metadata.kind === "addon") {
      const revisions = await tx.projectEntitlement.findUnique({
        where: { projectId_key: { projectId: project.id, key: "revisions" } },
        select: { id: true, limitInt: true },
      });

      if (!revisions) {
        await tx.projectEntitlement.create({
          data: { projectId: project.id, key: "revisions", limitInt: 1, consumedInt: 0, reservedInt: 0 },
        });
      } else {
        await tx.projectEntitlement.update({
          where: { id: revisions.id },
          data: { limitInt: Math.max(revisions.limitInt ?? 0, 0) + 1 },
        });
      }

      await logAudit(tx, {
        projectId: project.id,
        actorId: null,
        type: "entitlement_addon_applied",
        payload: {
          checkoutSessionId: sessionId,
          paymentIntentId,
          addonKey: metadata.addonKey,
          revisionDelta: 1,
        },
      });
    }

    if (metadata.kind === "upgrade") {
      const target = PACKAGE_ENTITLEMENTS[metadata.toPackage];
      for (const entitlement of target) {
        await tx.projectEntitlement.upsert({
          where: { projectId_key: { projectId: project.id, key: entitlement.key } },
          create: {
            projectId: project.id,
            key: entitlement.key,
            limitInt: entitlement.limitInt,
            consumedInt: 0,
            reservedInt: 0,
          },
          update: {
            limitInt: { set: entitlement.limitInt },
          },
        });

        await tx.projectEntitlement.updateMany({
          where: {
            projectId: project.id,
            key: entitlement.key,
            limitInt: { lt: entitlement.limitInt },
          },
          data: { limitInt: entitlement.limitInt },
        });
      }

      await tx.project.update({ where: { id: project.id }, data: { packageCode: metadata.toPackage } });

      await logAudit(tx, {
        projectId: project.id,
        actorId: null,
        type: "package_upgrade_applied",
        payload: {
          checkoutSessionId: sessionId,
          paymentIntentId,
          fromPackage: metadata.fromPackage,
          toPackage: metadata.toPackage,
        },
      });
    }

    const order = await tx.projectOrder.create({
      data: {
        projectId: project.id,
        clientId: project.clientId,
        status: ORDER_STATUS_FULFILLED,
        currency,
        totalCents,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: paymentIntentId,
        campaignSlug: metadata.kind === "addon" ? `addon:${metadata.addonKey}` : `upgrade:${metadata.fromPackage}->${metadata.toPackage}`,
      },
    });

    await logAudit(tx, {
      projectId: project.id,
      actorId: null,
      type: "order_fulfilled",
      payload: { orderId: order.id, orderStatus: ORDER_STATUS_FULFILLED, checkoutSessionId: sessionId, kind: metadata.kind },
    });

    return {
      deduped: false,
      projectId: project.id,
      orderId: order.id,
      clientId: project.clientId,
      purchaserEmail,
      firstName: checkoutName.firstName,
      lastName: checkoutName.lastName,
    };
  });
}

export async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<FulfillmentResult> {
  // This is the shared trust boundary used by webhooks and manual reprocessing.
  // Check payment before dedupe lookups or any purchaser/provisioning work.
  if (session.payment_status !== "paid") {
    throw new CheckoutSessionNotPaidError(session.payment_status ?? null);
  }

  const sessionId = session.id;
  const purchaserEmail = await purchaserEmailFromSession(session);
  const checkoutName = checkoutNameFromSession(session);

  const upsellMetadata = parseUpsellMetadata(session);
  if (upsellMetadata) {
    return fulfillUpsellSession(session, upsellMetadata, purchaserEmail, checkoutName);
  }

  const existingOrder = await prisma.projectOrder.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { id: true, projectId: true, clientId: true },
  });

  if (existingOrder) {
    return {
      deduped: true,
      projectId: existingOrder.projectId,
      orderId: existingOrder.id,
      clientId: existingOrder.clientId,
      purchaserEmail,
      firstName: checkoutName.firstName,
      lastName: checkoutName.lastName,
    };
  }

  const packageCode = await packageCodeFromSession(sessionId);
  const clientName = inferClientName(session, checkoutName);
  const slugBase = toSlug(clientName) || "logo-fountain-client";
  const slug = `${slugBase}-${sessionId.slice(-8).toLowerCase()}`;

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const currency = (session.currency || "gbp").toLowerCase();
  const totalCents = session.amount_total ?? 0;

  const orderStatus = purchaserEmail ? ORDER_STATUS_FULFILLED : ORDER_STATUS_NEEDS_CONTACT;

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        name: clientName,
        slug,
        billingEmail: purchaserEmail,
      },
    });

    const project = await tx.project.create({
      data: {
        clientId: client.id,
        status: PROJECT_STATUS_AWAITING_BRIEF,
        packageCode,
      },
    });

    await tx.projectEntitlement.createMany({
      data: PACKAGE_ENTITLEMENTS[packageCode].map((entitlement) => ({
        projectId: project.id,
        key: entitlement.key,
        limitInt: entitlement.limitInt,
      })),
      skipDuplicates: true,
    });

    const order = await tx.projectOrder.create({
      data: {
        projectId: project.id,
        clientId: client.id,
        status: orderStatus,
        currency,
        totalCents,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: paymentIntentId,
      },
    });

    await logAudit(tx, {
      projectId: project.id,
      actorId: null,
      type: "order_fulfilled",
      payload: { orderId: order.id, orderStatus, checkoutSessionId: sessionId },
    });

    await logAudit(tx, {
      projectId: project.id,
      actorId: null,
      type: "state_changed",
      payload: { previousStatus: null, nextStatus: PROJECT_STATUS_AWAITING_BRIEF },
    });

    return {
      deduped: false,
      projectId: project.id,
      orderId: order.id,
      clientId: client.id,
      purchaserEmail,
      firstName: checkoutName.firstName,
      lastName: checkoutName.lastName,
    };
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

// Internal-only trusted paid fulfillment boundary; no public provisioning API.
export async function ensureAccessProvisioning(
  clientId: string,
  purchaserEmail: string,
  checkoutName?: Pick<CheckoutName, "firstName" | "lastName">,
): Promise<{ userId: string; existed: boolean; needsSetup: boolean }> {
  const email = normalizeEmail(purchaserEmail);
  if (!email) throw new Error("Purchaser email required");
  const firstName = normalizeText(checkoutName?.firstName);
  const lastName = normalizeText(checkoutName?.lastName);
  const fullName = normalizeText([firstName, lastName].filter(Boolean).join(" "));
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"provision:" + email}, 0))`;
    const client = await tx.client.findUnique({ where: { id: clientId } });
    const order = await tx.projectOrder.findFirst({ where: { clientId, status: ORDER_STATUS_FULFILLED } });
    if (!client || normalizeEmail(client.billingEmail) !== email || !order) throw new Error("Verified paid client required before access provisioning");
    const existing = await tx.authUser.findUnique({ where: { email } });
    // Payment is NOT mailbox proof. Never promote emailVerified/admin here.
    const user = existing ?? await tx.authUser.create({ data: { email, name: fullName || email, emailVerified: false } });
    await tx.profile.upsert({
      where: { id: user.id },
      create: { id: user.id, email, fullName, firstName, lastName },
      update: { ...(firstName !== null ? { firstName } : {}), ...(lastName !== null ? { lastName } : {}), ...(fullName !== null ? { fullName } : {}) },
    });
    await tx.clientMembership.createMany({ data: [{ clientId, userId: user.id, role: "owner" }], skipDuplicates: true });
    // Durable state, not "row existed on this attempt": a customer who has never
    // set a password still needs setup after a failed first email and a retry.
    const credential = await tx.authAccount.findFirst({ where: { userId: user.id, providerId: "credential", password: { not: null } }, select: { id: true } });
    return { userId: user.id, existed: Boolean(existing), needsSetup: !credential };
  });
}
