import { PACKAGE_TO_PRICE_ID, type PackageCode, stripe } from "@/lib/stripe";

export const runtime = "nodejs";

type CreateCheckoutSessionBody = {
  package_code?: unknown;
  campaign_slug?: unknown;
};

function parsePackageCode(value: unknown): PackageCode | null {
  if (typeof value !== "string") return null;
  if (value === "essential" || value === "professional" || value === "complete") return value;
  return null;
}

function parseCampaignSlug(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 80);
}

export async function POST(req: Request) {
  let payload: CreateCheckoutSessionBody;

  try {
    payload = (await req.json()) as CreateCheckoutSessionBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const packageCode = parsePackageCode(payload.package_code);
  if (!packageCode) {
    return Response.json(
      {
        error: "Invalid package_code. Expected one of: essential, professional, complete",
      },
      { status: 400 }
    );
  }

  const campaignSlug = parseCampaignSlug(payload.campaign_slug);
  const priceId = PACKAGE_TO_PRICE_ID[packageCode];

  const origin = new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    billing_address_collection: "auto",
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      package_code: packageCode,
      ...(campaignSlug ? { campaign_slug: campaignSlug } : {}),
    },
  });

  if (!session.url) {
    return Response.json({ error: "Failed to create checkout session URL" }, { status: 500 });
  }

  return Response.json({ url: session.url });
}
