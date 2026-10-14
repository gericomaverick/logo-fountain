import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  ensureAccessProvisioning,
  fulfillCheckoutSession,
  isUniqueViolation,
  ORDER_STATUS_FULFILLED,
  ORDER_STATUS_NEEDS_CONTACT,
} from "@/lib/checkout-fulfillment";
import { generateAndSendMagicLinkEmail } from "@/lib/magic-link-email";
import { classifyWebhookError } from "@/lib/webhook-error-classification";
import { notifyAdminNewProject } from "@/lib/project-lifecycle-email";

export const runtime = "nodejs";

const PROCESSING_MARKER_PREFIX = "processing:";
const PROCESSING_LEASE_MS = 5 * 60 * 1000;

function createProcessingMarker(eventType: string, now = Date.now()) {
  return `${PROCESSING_MARKER_PREFIX}${now}:${crypto.randomUUID()}:${eventType}`;
}

function processingStartedAt(type: string): number | null {
  if (!type.startsWith(PROCESSING_MARKER_PREFIX)) return null;
  const timestamp = Number(type.slice(PROCESSING_MARKER_PREFIX.length).split(":", 1)[0]);
  return Number.isFinite(timestamp) ? timestamp : null;
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

  const isFulfillmentEvent = event.type === "checkout.session.completed"
    || event.type === "checkout.session.async_payment_succeeded";
  const isAsyncFailure = event.type === "checkout.session.async_payment_failed";

  if (!isFulfillmentEvent) {
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

    if (isAsyncFailure) {
      // Keep the event durable and observable without logging the provider payload.
      console.warn("Stripe asynchronous checkout payment failed", { id: event.id, type: event.type });
      return Response.json({ received: true, paymentFailed: true, id: event.id, type: event.type });
    }
    return Response.json({ received: true, ignored: true, id: event.id, type: event.type });
  }

  let processingMarker = createProcessingMarker(event.type);

  try {
    await prisma.stripeEvent.create({
      data: {
        eventId: event.id,
        type: processingMarker,
        createdAt: new Date(event.created * 1000),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await prisma.stripeEvent.findUnique({ where: { eventId: event.id } });
      if (existing?.processedAt) {
        return Response.json({ received: true, deduped: true, id: event.id, type: event.type });
      }

      const startedAt = existing ? processingStartedAt(existing.type) : null;
      const hasActiveLease = startedAt !== null && Date.now() - startedAt < PROCESSING_LEASE_MS;
      if (existing && !hasActiveLease) {
        const reclaimed = await prisma.stripeEvent.updateMany({
          where: { eventId: event.id, type: existing.type, processedAt: null },
          data: { type: processingMarker },
        });
        if (reclaimed.count === 1) {
          // This delivery owns the expired (or legacy unmarked) processing claim.
        } else {
          return Response.json(
            { received: true, inFlight: true, retry: true, id: event.id, type: event.type },
            { status: 409 },
          );
        }
      } else {
        return Response.json(
          { received: true, inFlight: true, retry: true, id: event.id, type: event.type },
          { status: 409 },
        );
      }
    } else {
      throw error;
    }
  }

  async function renewProcessingLease() {
    const renewedMarker = createProcessingMarker(event.type);
    const renewed = await prisma.stripeEvent.updateMany({
      where: { eventId: event.id, type: processingMarker, processedAt: null },
      data: { type: renewedMarker },
    });
    if (renewed.count !== 1) {
      const error = new Error("Stripe webhook processing claim ownership was lost");
      Object.assign(error, { code: "WEBHOOK_CLAIM_LOST" });
      throw error;
    }
    processingMarker = renewedMarker;
  }

  try {
    const payloadSession = event.data.object as Stripe.Checkout.Session;
    if (!payloadSession || typeof payloadSession.id !== "string" || payloadSession.id.trim().length === 0) {
      throw new Error("Malformed Stripe event payload: missing checkout session id");
    }
    // Delayed-payment success is fulfilled from a fresh Stripe representation,
    // rather than trusting a potentially sparse webhook object.
    const session = event.type === "checkout.session.async_payment_succeeded"
      ? await stripe.checkout.sessions.retrieve(payloadSession.id)
      : payloadSession;

    const fulfillment = await fulfillCheckoutSession(session);
    // Fence off an owner whose lease expired during durable fulfillment before it
    // can perform non-idempotent follow-up side effects.
    await renewProcessingLease();

    let provisionedUserId: string | null = null;
    let isReturningCustomer = false;
    if (fulfillment.purchaserEmail) {
      const provisioning = await ensureAccessProvisioning(fulfillment.clientId, fulfillment.purchaserEmail, {
        firstName: fulfillment.firstName,
        lastName: fulfillment.lastName,
      });
      provisionedUserId = provisioning.userId;
      isReturningCustomer = provisioning.existed;
    }

    if (fulfillment.purchaserEmail) {
      const customerEmailAuditType = `email_sent:checkout_auth:${session.id}`;
      const alreadySent = await prisma.auditEvent.findFirst({
        where: { projectId: fulfillment.projectId, type: customerEmailAuditType },
        select: { id: true },
      });
      if (!alreadySent) {
        await renewProcessingLease();
        const sendResult = await generateAndSendMagicLinkEmail({
          purchaserEmail: fulfillment.purchaserEmail,
          request: req,
          projectId: fulfillment.projectId,
          // Only trusted provisioning may select setup. Public endpoints always
          // fall back to sign-in so a leaked Session ID cannot change a password.
          flow: isReturningCustomer ? "signin" : "setup",
        });
        if (sendResult.skipped) {
          if (process.env.NODE_ENV === "production") throw new Error("Required checkout customer email was skipped");
        } else {
          await prisma.auditEvent.create({
            data: {
              projectId: fulfillment.projectId,
              actorId: null,
              type: customerEmailAuditType,
              payload: { checkoutSessionId: session.id },
            },
          });
        }
      }
    }

    const isNewProjectCheckout = !session.metadata?.kind;
    if (isNewProjectCheckout) {
      // notifyAdminNewProject has its own durable sent marker. Durable fulfillment
      // may therefore resume this side effect on a later webhook attempt.
      await renewProcessingLease();
      const adminResult = await notifyAdminNewProject(fulfillment.projectId);
      if (adminResult?.status === "skipped" && process.env.NODE_ENV === "production") {
        throw new Error("Required new-project admin email was skipped");
      }
    }

    await renewProcessingLease();
    const completed = await prisma.stripeEvent.updateMany({
      where: { eventId: event.id, type: processingMarker, processedAt: null },
      data: { type: event.type, processedAt: new Date() },
    });
    if (completed.count !== 1) {
      const error = new Error("Stripe webhook processing claim ownership was lost before completion");
      Object.assign(error, { code: "WEBHOOK_CLAIM_LOST" });
      throw error;
    }

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
      isReturningCustomer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fulfillment failed";
    const classification = classifyWebhookError(error);

    const logPayload = {
      id: event.id,
      type: event.type,
      classification: classification.kind,
      reason: classification.reason,
      retry: classification.shouldRetry,
    };

    if (classification.logLevel === "warn") {
      console.warn("Stripe checkout webhook failed permanently", logPayload);
      await prisma.stripeEvent.updateMany({
        where: { eventId: event.id, type: processingMarker, processedAt: null },
        data: { type: event.type, processedAt: new Date() },
      });
    } else {
      console.error("Stripe checkout webhook failed transiently", logPayload);
      // Release only this delivery's claim. If the delete itself fails, the lease
      // marker remains reclaimable after PROCESSING_LEASE_MS rather than wedging
      // the Stripe event forever.
      await prisma.stripeEvent.deleteMany({
        where: { eventId: event.id, type: processingMarker, processedAt: null },
      });
    }

    return Response.json(
      {
        received: true,
        fulfilled: false,
        error: "Webhook processing failed",
        classification: classification.kind,
        retry: classification.shouldRetry,
      },
      { status: classification.responseStatus },
    );
  }
}
