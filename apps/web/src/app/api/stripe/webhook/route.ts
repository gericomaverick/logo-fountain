import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { PRICE_ID_TO_PACKAGE, stripe, type PackageCode } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const PROJECT_STATUS_AWAITING_BRIEF = "AWAITING_BRIEF";
const ORDER_STATUS_FULFILLED = "FULFILLED";
const ORDER_STATUS_NEEDS_CONTACT = "NEEDS_CONTACT";

const PACKAGE_ENTITLEMENTS: Record<PackageCode, Array<{ key: string; limitInt: number }>> = {
  essential: [
    { key: "concepts_allowed", limitInt: 2 },
    { key: "revisions_allowed", limitInt: 2 },
  ],
  professional: [
    { key: "concepts_allowed", limitInt: 3 },
    { key: "revisions_allowed", limitInt: 2 },
  ],
  complete: [
    { key: "concepts_allowed", limitInt: 3 },
    { key: "revisions_allowed", limitInt: 5 },
  ],
};

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function inferClientName(session: Stripe.Checkout.Session): string {
  const fromStripe = session.customer_details?.name?.trim();
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

async function purchaserEmailFromSession(session: Stripe.Checkout.Session): Promise<string | null> {
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

type FulfillmentResult = {
  deduped: boolean;
  projectId: string;
  orderId: string;
  clientId: string;
  purchaserEmail: string | null;
};

async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<FulfillmentResult> {
  const sessionId = session.id;
  const purchaserEmail = await purchaserEmailFromSession(session);

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
    };
  }

  const packageCode = await packageCodeFromSession(sessionId);
  const clientName = inferClientName(session);
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

    return {
      deduped: false,
      projectId: project.id,
      orderId: order.id,
      clientId: client.id,
      purchaserEmail,
    };
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

async function resolveOrCreateAuthUserId(email: string): Promise<string> {
  const supabaseAdmin = createSupabaseAdminClient();

  const createResult = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createResult.data.user?.id) {
    return createResult.data.user.id;
  }

  const message = (createResult.error?.message || "").toLowerCase();
  if (!message.includes("already")) {
    throw new Error(createResult.error?.message || "Failed to create Supabase auth user");
  }

  let page = 1;
  while (page <= 10) {
    const listed = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw new Error(listed.error.message || "Failed to list Supabase users");

    const existing = listed.data.users.find((u) => normalizeEmail(u.email) === email);
    if (existing?.id) return existing.id;

    if (listed.data.users.length < 200) break;
    page += 1;
  }

  const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (invited.error || !invited.data.user?.id) {
    throw new Error(invited.error?.message || "Failed to invite Supabase auth user");
  }

  return invited.data.user.id;
}

async function ensureAccessProvisioning(clientId: string, purchaserEmail: string): Promise<{ userId: string }> {
  const userId = await resolveOrCreateAuthUserId(purchaserEmail);

  await prisma.$transaction(async (tx) => {
    try {
      await tx.profile.upsert({
        where: { id: userId },
        create: { id: userId, email: purchaserEmail },
        update: { email: purchaserEmail },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const byEmail = await tx.profile.findUnique({ where: { email: purchaserEmail } });
      if (!byEmail) throw error;
    }

    await tx.clientMembership.createMany({
      data: [{ clientId, userId, role: "owner" }],
      skipDuplicates: true,
    });
  });

  return { userId };
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response(
      "STRIPE_WEBHOOK_SECRET not set. For local dev run: stripe listen --forward-to localhost:3000/api/stripe/webhook",
      { status: 400 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    await prisma.stripeEvent.upsert({
      where: { eventId: event.id },
      create: {
        eventId: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000),
        processedAt: new Date(),
      },
      update: {
        type: event.type,
        processedAt: new Date(),
      },
    });

    return Response.json({ received: true, ignored: true, id: event.id, type: event.type });
  }

  try {
    await prisma.stripeEvent.create({
      data: {
        eventId: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await prisma.stripeEvent.findUnique({ where: { eventId: event.id } });
      if (existing?.processedAt) {
        return Response.json({ received: true, deduped: true, id: event.id, type: event.type });
      }

      return Response.json(
        { received: true, inFlight: true, id: event.id, type: event.type },
        { status: 202 }
      );
    }

    throw error;
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session;
    const fulfillment = await fulfillCheckoutSession(session);

    let provisionedUserId: string | null = null;
    if (fulfillment.purchaserEmail) {
      const provisioning = await ensureAccessProvisioning(fulfillment.clientId, fulfillment.purchaserEmail);
      provisionedUserId = provisioning.userId;
    }

    await prisma.stripeEvent.update({
      where: { eventId: event.id },
      data: { processedAt: new Date() },
    });

    return Response.json({
      received: true,
      fulfilled: true,
      deduped: fulfillment.deduped,
      projectId: fulfillment.projectId,
      id: event.id,
      type: event.type,
      purchaserEmail: fulfillment.purchaserEmail,
      orderStatus: fulfillment.purchaserEmail ? ORDER_STATUS_FULFILLED : ORDER_STATUS_NEEDS_CONTACT,
      provisionedUserId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fulfillment failed";
    return Response.json({ received: true, fulfilled: false, error: message }, { status: 500 });
  }
}
