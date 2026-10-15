import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

/**
 * Standalone usage rewinds can make counters disagree with published concepts
 * and revision requests. Usage may now be cleared only by the guarded
 * clean-slate reset, which removes active lifecycle records atomically.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  void context;
  try {
    const user = await requireUser();
    await requireAdmin(user);
    return jsonError(
      "Standalone entitlement usage resets are disabled",
      409,
      { nextStep: "Use the confirmed clean-slate project reset so active records and both consumed and reserved usage are cleared together." },
      "ENTITLEMENT_USAGE_RESET_DISABLED",
    );
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
