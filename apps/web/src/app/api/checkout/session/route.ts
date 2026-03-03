import { jsonError } from "@/lib/api-error";
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
    return jsonError("Invalid JSON body", 400, { nextStep: "Send a valid JSON payload." }, "INVALID_JSON");
  }

  const packageCode = parsePackageCode(payload.package_code);
  if (!packageCode) {
    return jsonError("Invalid package_code. Expected one of: essential, professional, complete", 400, undefined, "INVALID_PACKAGE");
  }

  const campaignSlug = parseCampaignSlug(payload.campaign_slug);
  const priceId = PACKAGE_TO_PRICE_ID[packageCode];

  try {
    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      line_items: [{ price: priceId, quantity: 1 }],
      custom_fields: [
        {
          key: "first_name",
          label: { type: "custom", custom: "First name" },
          type: "text",
          text: { minimum_length: 1, maximum_length: 80 },
          optional: false,
        },
        {
          key: "last_name",
          label: { type: "custom", custom: "Last name" },
          type: "text",
          text: { minimum_length: 1, maximum_length: 80 },
          optional: false,
        },
      ],
      metadata: {
        package_code: packageCode,
        ...(campaignSlug ? { campaign_slug: campaignSlug } : {}),
      },
    });

    if (!session.url) return jsonError("Failed to create checkout session URL", 500, undefined, "CHECKOUT_URL_MISSING");

    return Response.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create checkout session";
    return jsonError(message, 500, { nextStep: "Verify Stripe configuration and retry." }, "CHECKOUT_SESSION_FAILED");
  }
}
