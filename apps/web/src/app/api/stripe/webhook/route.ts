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
import { sendCheckoutContinueEmail } from "@/lib/checkout-continue-email";

export const runtime = "nodejs";

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
      const provisioning = await ensureAccessProvisioning(fulfillment.clientId, fulfillment.purchaserEmail, {
        firstName: fulfillment.firstName,
        lastName: fulfillment.lastName,
      });
      provisionedUserId = provisioning.userId;
    }

    if (fulfillment.purchaserEmail) {
      const appBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
      try {
        await sendCheckoutContinueEmail({
          purchaserEmail: fulfillment.purchaserEmail,
          baseUrl: appBaseUrl,
          sessionId: session.id,
        });
      } catch (emailError) {
        console.error("Failed to send checkout magic-link email", emailError);
      }
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
