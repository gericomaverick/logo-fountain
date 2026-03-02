import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const stripe = new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
  // Keep in sync with the Stripe SDK types bundled with the installed version.
  apiVersion: "2026-02-25.clover",
});

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

  // Webhook dedupe (LF-0203): record Stripe event id.
  // If we already processed this event, return 200 to stop Stripe retries.
  const existing = await prisma.stripeEvent.findUnique({ where: { eventId: event.id } });
  if (existing?.processedAt) {
    return Response.json({ received: true, deduped: true, id: event.id, type: event.type });
  }

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

  // TODO (LF-0204): idempotent fulfillment for checkout.session.completed.
  return Response.json({ received: true, id: event.id, type: event.type });
}
