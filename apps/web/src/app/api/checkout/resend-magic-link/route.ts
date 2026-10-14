import { sendCheckoutAuthenticationEmail } from "@/lib/checkout-auth-email";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return sendCheckoutAuthenticationEmail(req);
}
