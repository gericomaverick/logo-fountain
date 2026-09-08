import { jsonError } from "@/lib/api-error";
import { getConfiguredMarketingSiteOrigin, getRequestOrigin } from "@/lib/request-origin";
import { PACKAGE_TO_PRICE_ID, stripe, type PackageCode } from "@/lib/stripe";

export const runtime = "nodejs";

function parsePackageCode(value: string | null): PackageCode | null {
  if (value === "essential" || value === "professional" || value === "complete") return value;
  return null;
}

function parseCampaignSlug(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 80);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const packageCode = parsePackageCode(url.searchParams.get("package_code"));

  if (!packageCode) {
    return jsonError("Invalid package_code. Expected one of: essential, professional, complete", 400, undefined, "INVALID_PACKAGE");
  }

  const campaignSlug = parseCampaignSlug(url.searchParams.get("campaign_slug"));
  const origin = getRequestOrigin(req);
  const cancelOrigin = getConfiguredMarketingSiteOrigin() ?? origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cancelOrigin}/#packages`,
      line_items: [{ price: PACKAGE_TO_PRICE_ID[packageCode], quantity: 1 }],
      invoice_creation: {
        enabled: true,
      },
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

    return Response.redirect(session.url, 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create checkout session";
    return jsonError(message, 500, { nextStep: "Verify Stripe configuration and retry." }, "CHECKOUT_SESSION_FAILED");
  }
}
