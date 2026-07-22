import { logAudit } from "@/lib/audit";
import { jsonError } from "@/lib/api-error";
import { requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { validateNewPassword } from "@/lib/auth/validation";
import { verifyUserPassword } from "@/lib/auth/verify-password";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ChangePasswordBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
};

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    let payload: ChangePasswordBody;
    try {
      payload = (await req.json()) as ChangePasswordBody;
    } catch {
      return jsonError("Invalid JSON body", 400, { nextStep: "Send a valid JSON payload." }, "INVALID_JSON");
    }

    const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
    const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";

    if (!user.email) {
      return jsonError(
        "Password sign-in isn't enabled for this account.",
        400,
        { nextStep: "This account signs in without a password." },
        "NO_PASSWORD_LOGIN",
      );
    }

    if (!currentPassword) {
      return jsonError(
        "Enter your current password.",
        400,
        { nextStep: "Provide your current password to authorize the change." },
        "CURRENT_PASSWORD_REQUIRED",
      );
    }

    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      return jsonError(passwordError, 400, { nextStep: passwordError }, "WEAK_PASSWORD");
    }

    if (newPassword === currentPassword) {
      return jsonError(
        "Choose a password different from your current one.",
        400,
        { nextStep: "Pick a new password you haven't used here before." },
        "PASSWORD_UNCHANGED",
      );
    }

    // Authorize the change with the current password before touching the account,
    // so a hijacked but unattended session cannot silently reset the password.
    const verified = await verifyUserPassword(user.email, currentPassword);
    if (!verified) {
      return jsonError(
        "Current password is incorrect.",
        400,
        { nextStep: "Re-enter your existing password and try again." },
        "CURRENT_PASSWORD_INVALID",
      );
    }

    const admin = createSupabaseAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
    if (updateError) {
      return jsonError(
        "We couldn't update your password.",
        400,
        { nextStep: updateError.message },
        "PASSWORD_UPDATE_FAILED",
      );
    }

    // Best-effort hardening: revoke the account's other sessions so a change made
    // in response to suspected compromise actually evicts anyone else signed in.
    try {
      const serverClient = await createSupabaseServerClient();
      const {
        data: { session },
      } = await serverClient.auth.getSession();
      if (session?.access_token) {
        await admin.auth.admin.signOut(session.access_token, "others");
      }
    } catch (error) {
      console.error("password change: failed to revoke other sessions", error);
    }

    try {
      await logAudit(prisma, {
        actorId: user.id,
        type: "auth.password_changed",
        payload: { method: "settings" },
      });
    } catch (error) {
      console.error("password change: failed to write audit event", error);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
